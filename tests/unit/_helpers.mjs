export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function makeChromeStorage(initialData = {}) {
  const data = { ...initialData };

  return {
    get: async (keys) => {
      if (Array.isArray(keys)) {
        const result = {};
        for (const key of keys) {
          result[key] = data[key];
        }
        return result;
      }

      if (typeof keys === "string") {
        return { [keys]: data[keys] };
      }

      return { ...data };
    },
    set: async (items) => {
      Object.assign(data, items);
    },
    _dump: () => ({ ...data }),
  };
}

export function installChromeStub({ localData = {}, manifest = {} } = {}) {
  const local = makeChromeStorage(localData);
  globalThis.chrome = {
    runtime: {
      getManifest: () => manifest,
    },
    storage: {
      local,
      onChanged: {
        addListener: () => {},
      },
    },
    tabs: {
      query: () => {
        throw new Error("tabs.query called in unit test");
      },
      update: () => {
        throw new Error("tabs.update called in unit test");
      },
      create: () => {
        throw new Error("tabs.create called in unit test");
      },
    },
  };

  return local;
}

export function uninstallChromeStub() {
  delete globalThis.chrome;
}

export function makeAllProblems(questions) {
  return {
    data: {
      problemsetQuestionList: {
        total: questions.length,
        questions,
      },
    },
  };
}

export function q({
  titleSlug,
  difficulty = "Easy",
  acRate = 50,
  status = null,
  paidOnly = false,
  topicSlugs = [],
}) {
  return {
    acRate,
    difficulty,
    paidOnly,
    status,
    title: titleSlug,
    titleSlug,
    topicTags: topicSlugs.map((slug) => ({ slug, name: slug, id: slug })),
  };
}
