"""
Screenshot Verification Script for Chrome Web Store

Checks all images in the screenshots/ directory and validates they meet
Chrome Web Store dimension requirements (1280x800 or 640x400).
Outputs a verified_screenshots.json report.
"""

import json
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow is not installed. Run: pip install Pillow")
    sys.exit(1)

# Chrome Web Store accepted screenshot dimensions
VALID_DIMENSIONS = [
    (1280, 800),
    (640, 400),
]

SCREENSHOTS_DIR = Path(__file__).resolve().parent.parent / "screenshots"
OUTPUT_FILE = Path(__file__).resolve().parent.parent / "screenshots" / "verified_screenshots.json"

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}


def verify_screenshots():
    """Scan the screenshots directory and verify each image's dimensions."""
    if not SCREENSHOTS_DIR.exists():
        print(f"ERROR: Screenshots directory not found at {SCREENSHOTS_DIR}")
        sys.exit(1)

    results = {}
    all_verified = True

    image_files = sorted(
        f for f in SCREENSHOTS_DIR.iterdir()
        if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS
    )

    if not image_files:
        print("WARNING: No image files found in screenshots/ directory.")
        return

    print(f"Checking {len(image_files)} screenshot(s) in {SCREENSHOTS_DIR}\n")
    print(f"{'File':<55} {'Dimensions':<15} {'Status'}")
    print("-" * 80)

    for image_path in image_files:
        try:
            with Image.open(image_path) as img:
                width, height = img.size
                dimensions = (width, height)
                verified = dimensions in VALID_DIMENSIONS

                status = "✅ VERIFIED" if verified else "❌ INVALID"
                if not verified:
                    all_verified = False
                    valid_str = ", ".join(f"{w}x{h}" for w, h in VALID_DIMENSIONS)
                    status += f" (expected: {valid_str})"

                print(f"{image_path.name:<55} {width}x{height:<10} {status}")

                results[image_path.name] = {
                    "width": width,
                    "height": height,
                    "verified": verified,
                    "dimensions_str": f"{width}x{height}",
                }
        except Exception as e:
            print(f"{image_path.name:<55} {'ERROR':<15} ⚠️  {e}")
            results[image_path.name] = {
                "verified": False,
                "error": str(e),
            }
            all_verified = False

    # Write report
    report = {
        "screenshot_dir": str(SCREENSHOTS_DIR),
        "valid_dimensions": [f"{w}x{h}" for w, h in VALID_DIMENSIONS],
        "all_verified": all_verified,
        "total": len(results),
        "verified_count": sum(1 for r in results.values() if r.get("verified")),
        "failed_count": sum(1 for r in results.values() if not r.get("verified")),
        "screenshots": results,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"\n📄 Report written to: {OUTPUT_FILE}")
    if all_verified:
        print("🎉 All screenshots meet Chrome Web Store requirements!")
    else:
        print(
            f"⚠️  {report['failed_count']}/{report['total']} screenshot(s) "
            f"do NOT meet the required dimensions."
        )
        sys.exit(1)


if __name__ == "__main__":
    verify_screenshots()
