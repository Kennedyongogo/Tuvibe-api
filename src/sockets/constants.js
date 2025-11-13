const SUSPENSION_NAMESPACE = "/suspensions";

const roomKey = (suspensionId) => `suspension:${suspensionId}`;

module.exports = {
  SUSPENSION_NAMESPACE,
  roomKey,
};
