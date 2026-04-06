export const SUPPORTED_LANGUAGES = {
  cpp: { label: "C++", judge0Id: 54 },
  java: { label: "Java", judge0Id: 62 },
  python: { label: "Python", judge0Id: 71 }
};

export const DEFAULT_LANGUAGE = "python";

export function isLanguageSupported(language) {
  return Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, language);
}
