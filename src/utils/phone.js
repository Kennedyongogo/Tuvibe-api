const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

const normalizePhoneNumber = (input) => {
  if (input === undefined || input === null) {
    return "";
  }

  const trimmed = String(input).trim();
  // Remove spaces and hyphens to support "+254 700 000000" or "+254-700-000000"
  const stripped = trimmed.replace(/[\s-]+/g, "");

  return stripped;
};

const validatePhoneNumber = (input) => {
  const normalized = normalizePhoneNumber(input);

  if (!normalized) {
    return {
      valid: false,
      normalized: "",
      message: "Phone number is required.",
    };
  }

  if (!normalized.startsWith("+")) {
    return {
      valid: false,
      normalized,
      message:
        "Phone number must include the country code, e.g., +254798123456.",
    };
  }

  if (!/^\+[0-9]+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      message:
        "Phone number can only contain digits after the '+' country code prefix.",
    };
  }

  if (!PHONE_REGEX.test(normalized)) {
    return {
      valid: false,
      normalized,
      message: "Enter a valid international phone number, e.g., +254798123456.",
    };
  }

  return {
    valid: true,
    normalized,
    message: "",
  };
};

module.exports = {
  PHONE_REGEX,
  normalizePhoneNumber,
  validatePhoneNumber,
};
