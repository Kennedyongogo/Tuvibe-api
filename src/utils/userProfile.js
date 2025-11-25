const MIN_BIRTH_YEAR = 1900;
const MAX_AGE = 120;
const MIN_PUBLIC_USER_AGE = 18;

const getCurrentYear = () => new Date().getFullYear();

const normalizeBirthYear = (rawValue) => {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return null;
  }

  const birthYear = parseInt(rawValue, 10);
  if (Number.isNaN(birthYear)) {
    return null;
  }

  const currentYear = getCurrentYear();
  if (birthYear < MIN_BIRTH_YEAR || birthYear > currentYear) {
    return null;
  }

  return birthYear;
};

const deriveBirthYearFromAge = (rawAge) => {
  if (rawAge === undefined || rawAge === null || rawAge === "") {
    return null;
  }

  const age = parseInt(rawAge, 10);
  if (Number.isNaN(age) || age < 0 || age > MAX_AGE) {
    return null;
  }

  return getCurrentYear() - age;
};

const computeAgeFromBirthYear = (birthYear) => {
  const normalized = normalizeBirthYear(birthYear);
  if (!normalized) {
    return null;
  }

  const age = getCurrentYear() - normalized;
  if (age < 0 || age > MAX_AGE) {
    return null;
  }

  return age;
};

const isAdultFromBirthYear = (birthYear) => {
  const age = computeAgeFromBirthYear(birthYear);
  if (age === null) {
    return null;
  }
  return age >= MIN_PUBLIC_USER_AGE;
};

const isAdultFromAge = (age) => {
  if (age === undefined || age === null || age === "") {
    return null;
  }

  const parsedAge = parseInt(age, 10);
  if (Number.isNaN(parsedAge) || parsedAge < 0 || parsedAge > MAX_AGE) {
    return null;
  }

  return parsedAge >= MIN_PUBLIC_USER_AGE;
};

const isAdultFromPayload = (payload = {}) => {
  if (payload === null || typeof payload !== "object") {
    return null;
  }

  if (
    "birth_year" in payload ||
    "birthYear" in payload ||
    "yearOfBirth" in payload ||
    "year_of_birth" in payload
  ) {
    const birthYear = extractBirthYearFromPayload(payload);
    if (birthYear === null) {
      return null;
    }
    return isAdultFromBirthYear(birthYear);
  }

  if ("age" in payload) {
    return isAdultFromAge(payload.age);
  }

  return null;
};

const extractBirthYearFromPayload = (payload = {}) => {
  const candidateFields = [
    "birth_year",
    "birthYear",
    "yearOfBirth",
    "year_of_birth",
  ];

  for (const field of candidateFields) {
    if (field in payload) {
      const normalized = normalizeBirthYear(payload[field]);
      if (normalized !== null) {
        return normalized;
      }
      return null;
    }
  }

  if ("age" in payload) {
    return deriveBirthYearFromAge(payload.age);
  }

  return null;
};

const birthYearProvided = (payload = {}) => {
  const candidateFields = [
    "birth_year",
    "birthYear",
    "yearOfBirth",
    "year_of_birth",
    "age",
  ];

  return candidateFields.some((field) => {
    const value = payload[field];
    return value !== undefined && value !== null && value !== "";
  });
};

const formatUserForResponse = (userInstance) => {
  if (!userInstance) {
    return userInstance;
  }

  const raw =
    typeof userInstance.toJSON === "function"
      ? userInstance.toJSON()
      : { ...userInstance };

  // Ensure photos is always an array (handle JSONB serialization)
  if (raw.photos !== undefined && raw.photos !== null) {
    if (typeof raw.photos === "string") {
      try {
        raw.photos = JSON.parse(raw.photos);
      } catch (e) {
        console.error("Error parsing photos JSONB:", e);
        raw.photos = [];
      }
    }
    if (!Array.isArray(raw.photos)) {
      raw.photos = [];
    }
  } else {
    raw.photos = [];
  }

  const computedAge = computeAgeFromBirthYear(raw.birth_year);
  if (computedAge !== null) {
    raw.age = computedAge;
  } else if (raw.age !== undefined && raw.age !== null) {
    const derivedBirthYear = deriveBirthYearFromAge(raw.age);
    if (derivedBirthYear !== null && raw.birth_year === undefined) {
      raw.birth_year = derivedBirthYear;
    }
  }

  return raw;
};

const formatUserForPublicResponse = (userInstance) => {
  const raw = formatUserForResponse(userInstance);
  if (!raw) {
    return raw;
  }

  const sanitized = { ...raw };
  if ("name" in sanitized) {
    delete sanitized.name;
  }

  return sanitized;
};

module.exports = {
  MIN_BIRTH_YEAR,
  MAX_AGE,
  MIN_PUBLIC_USER_AGE,
  normalizeBirthYear,
  deriveBirthYearFromAge,
  computeAgeFromBirthYear,
  extractBirthYearFromPayload,
  birthYearProvided,
  formatUserForResponse,
  formatUserForPublicResponse,
  isAdultFromBirthYear,
  isAdultFromAge,
  isAdultFromPayload,
};
