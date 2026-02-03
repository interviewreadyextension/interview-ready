import { delog } from "../../../shared/logging.js";

export function createMessageController(doc, { setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
  const container = doc.getElementById("message");
  const textEl = doc.getElementById("messageText");
  const closeEl = doc.getElementById("messageClose");

  let clearTimer = null;

  const hideNow = () => {
    if (clearTimer) {
      clearTimeoutFn(clearTimer);
      clearTimer = null;
    }
    container.hidden = true;
    textEl.textContent = "";
  };

  const showText = (text, { durationMs = 4000 } = {}) => {
    if (!text) {
      text = "No problems available";
    }

    if (clearTimer) {
      clearTimeoutFn(clearTimer);
      clearTimer = null;
    }

    textEl.textContent = text;
    container.hidden = false;

    clearTimer = setTimeoutFn(() => {
      hideNow();
    }, durationMs);
  };

  const getMessage = (kind, context = {}) => {
    if (kind === "topic-empty") {
      const topic = context.topic ?? "this topic";
      const target = context.target ?? "suggested";
      const availability = context.availability ?? "unknown";

      if (target === "suggested") {
        if (availability === "no-problems") {
          return `No problems found for ${topic}.`;
        }

        if (availability === "no-unsolved") {
          return `No unsolved problems left for ${topic}.`;
        }

        return `No unsolved problems found for ${topic}.`;
      }

      if (target === "random") {
        if (availability === "no-problems") {
          return `No problems found for ${topic}. Try refresh.`;
        }

        if (availability === "no-unsolved") {
          return `No unsolved problems left for ${topic}. Try another topic.`;
        }

        return `No available problems found for ${topic}. Try refresh.`;
      }

      if (availability === "no-problems") {
        return `No ${target} problems found for ${topic}.`;
      }

      if (availability === "no-unsolved") {
        return `No unsolved ${target} problems left for ${topic}.`;
      }

      return `No unsolved ${target} problems found for ${topic}.`;
    }

    if (kind === "practice-empty") {
      const practiceType = context.practiceType ?? "random";
      const availability = context.availability ?? "unknown";

      if (practiceType === "suggested") {
        if (availability === "no-problems") {
          return "No recommended problems found. Try refresh.";
        }

        if (availability === "no-unsolved") {
          return "No recommended problems left. Pick a topic or use Random.";
        }

        return "No recommended problems available right now. Try refresh.";
      }

      if (practiceType === "review") {
        return "No completed problems to review yet.";
      }

      if (availability === "no-problems") {
        return "No problems found. Try refresh.";
      }

      if (availability === "no-unsolved") {
        return "No unsolved problems left. Try Review or pick a topic.";
      }

      return "No unsolved problems available. Try refresh.";
    }

    return "No problems available";
  };

  const show = (kind, context, options) => {
    const msg = getMessage(kind, context);
    showText(msg, options);
  };

  // Click anywhere on the banner to dismiss.
  container.addEventListener("click", () => {
    delog("Message dismissed by click");
    hideNow();
  });

  // Stop the close button click from double-firing (still dismisses).
  closeEl.addEventListener("click", (e) => {
    e.stopPropagation();
    hideNow();
  });

  // Ensure hidden by default.
  hideNow();

  return { showText, show, hideNow, getMessage };
}
