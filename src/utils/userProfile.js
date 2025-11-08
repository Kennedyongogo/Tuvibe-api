const MIN_BIRTH_YEAR = 1900;
const MAX_AGE = 120;

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

module.exports = {
  MIN_BIRTH_YEAR,
  MAX_AGE,
  normalizeBirthYear,
  deriveBirthYearFromAge,
  computeAgeFromBirthYear,
  extractBirthYearFromPayload,
  birthYearProvided,
  formatUserForResponse,
};

