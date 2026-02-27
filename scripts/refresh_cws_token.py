"""
Chrome Web Store OAuth Refresh Token Generator

This script:
1. Reads CLIENT_ID and CLIENT_SECRET from config.secret.json.
2. Opens a browser for you to authenticate with Google.
3. Captures the authorization code via a local callback server.
4. Exchanges the code for a refresh token.
5. Saves the refresh token back to config.secret.json.
6. Updates GitHub Secrets (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN) via `gh`.
7. Stores all secrets in GCP Secret Manager.

Prerequisites:
  - `gh` CLI installed and authenticated
  - `gcloud` CLI installed and authenticated
  - Google Cloud project with Chrome Web Store API and Secret Manager API enabled
  - OAuth 2.0 Client ID configured with redirect URI: http://localhost:8085
"""

import http.server
import json
import subprocess
import sys
import threading
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

# ──────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────
CONFIG_FILE = Path(__file__).resolve().parent.parent / "config.secret.json"
SCOPES = "https://www.googleapis.com/auth/chromewebstore"
REDIRECT_URI = "http://localhost:8085"
LOCAL_PORT = 8085
GCP_PROJECT = "intervewreadyleetcodeextension"


def load_config() -> dict:
    """Load credentials from config.secret.json."""
    if not CONFIG_FILE.exists():
        print(f"ERROR: {CONFIG_FILE} not found.")
        print("Create it with: {\"CLIENT_ID\": \"...\", \"CLIENT_SECRET\": \"...\"}")
        sys.exit(1)

    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        config = json.load(f)

    for key in ("CLIENT_ID", "CLIENT_SECRET"):
        if not config.get(key):
            print(f"ERROR: {key} is missing in {CONFIG_FILE}")
            sys.exit(1)

    return config


def save_config(config: dict):
    """Save config back to config.secret.json."""
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=4)
    print(f"  💾 Saved to {CONFIG_FILE}")


class OAuthCallbackHandler(http.server.BaseHTTPRequestHandler):
    """HTTP handler that captures the OAuth authorization code."""

    auth_code = None

    def do_GET(self):
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)

        if "code" in params:
            OAuthCallbackHandler.auth_code = params["code"][0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(
                b"<html><body><h2>Authorization successful!</h2>"
                b"<p>You can close this tab and return to the terminal.</p>"
                b"</body></html>"
            )
        elif "error" in params:
            error = params.get("error", ["unknown"])[0]
            self.send_response(400)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(
                f"<html><body><h2>Error: {error}</h2></body></html>".encode()
            )
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass


def exchange_code_for_tokens(auth_code: str, client_id: str, client_secret: str) -> dict:
    """Exchange the authorization code for access and refresh tokens."""
    token_url = "https://oauth2.googleapis.com/token"
    data = urllib.parse.urlencode({
        "code": auth_code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }).encode("utf-8")

    req = urllib.request.Request(token_url, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"ERROR exchanging code for tokens: {e.code}\n{body}")
        sys.exit(1)


def update_github_secret(name: str, value: str):
    """Update a GitHub Actions secret using the `gh` CLI."""
    print(f"  Setting GitHub secret: {name} ...", end=" ")
    result = subprocess.run(
        ["gh", "secret", "set", name, "--body", value],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        print("✅")
    else:
        print(f"❌\n  Error: {result.stderr.strip()}")


def upsert_gcp_secret(name: str, value: str):
    """Create or update a secret in GCP Secret Manager."""
    print(f"  Setting GCP secret: {name} ...", end=" ")

    # Check if secret exists
    check = subprocess.run(
        ["gcloud", "secrets", "describe", name,
         f"--project={GCP_PROJECT}", "--format=value(name)"],
        capture_output=True, text=True, shell=True,
    )

    if check.returncode != 0:
        # Create the secret
        create = subprocess.run(
            ["gcloud", "secrets", "create", name,
             f"--project={GCP_PROJECT}", "--replication-policy=automatic"],
            capture_output=True, text=True, shell=True,
        )
        if create.returncode != 0:
            print(f"❌ (create failed: {create.stderr.strip()})")
            return

    # Add a new version with the value
    add = subprocess.run(
        ["gcloud", "secrets", "versions", "add", name,
         f"--project={GCP_PROJECT}", "--data-file=-"],
        input=value, capture_output=True, text=True, shell=True,
    )
    if add.returncode == 0:
        print("✅")
    else:
        print(f"❌ ({add.stderr.strip()})")


def main():
    print("=" * 60)
    print("  Chrome Web Store — OAuth Refresh Token Generator")
    print("=" * 60)
    print()

    # Load config
    config = load_config()
    client_id = config["CLIENT_ID"]
    client_secret = config["CLIENT_SECRET"]
    print(f"✅ Loaded credentials from {CONFIG_FILE.name}")
    print(f"   CLIENT_ID: {client_id[:20]}...")
    print()

    # Build the authorization URL
    auth_params = urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
    })
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{auth_params}"

    # Start local callback server
    server = http.server.HTTPServer(("localhost", LOCAL_PORT), OAuthCallbackHandler)
    server_thread = threading.Thread(target=server.handle_request, daemon=True)
    server_thread.start()

    print(f"Opening browser for authentication...")
    print(f"If it doesn't open, navigate to:\n{auth_url}\n")
    import webbrowser
    webbrowser.open(auth_url)

    # Wait for the callback
    print("Waiting for authorization callback...")
    server_thread.join(timeout=120)
    server.server_close()

    if not OAuthCallbackHandler.auth_code:
        print("ERROR: No authorization code received. Timed out or cancelled.")
        sys.exit(1)

    print(f"✅ Authorization code received.\n")

    # Exchange for tokens
    print("Exchanging authorization code for tokens...")
    tokens = exchange_code_for_tokens(auth_code=OAuthCallbackHandler.auth_code,
                                      client_id=client_id,
                                      client_secret=client_secret)

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        print("ERROR: No refresh_token in response.")
        print(f"Response: {json.dumps(tokens, indent=2)}")
        sys.exit(1)

    print(f"✅ Refresh token obtained.\n")

    # Save to config.secret.json
    print("Saving to config.secret.json...")
    config["REFRESH_TOKEN"] = refresh_token
    save_config(config)
    print()

    # Update GitHub secrets
    print("Updating GitHub Secrets...")
    update_github_secret("CLIENT_ID", client_id)
    update_github_secret("CLIENT_SECRET", client_secret)
    update_github_secret("REFRESH_TOKEN", refresh_token)
    print()

    # Store in GCP Secret Manager
    print(f"Storing in GCP Secret Manager (project: {GCP_PROJECT})...")
    upsert_gcp_secret("cws-client-id", client_id)
    upsert_gcp_secret("cws-client-secret", client_secret)
    upsert_gcp_secret("cws-refresh-token", refresh_token)
    print()

    print("🎉 Done! Secrets saved to:")
    print("   • config.secret.json")
    print("   • GitHub Actions secrets")
    print(f"   • GCP Secret Manager ({GCP_PROJECT})")
    print(f"\nVerify with:")
    print(f"  gh secret list")
    print(f"  gcloud secrets list --project={GCP_PROJECT}")


if __name__ == "__main__":
    main()
