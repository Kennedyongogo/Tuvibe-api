const { getIo } = require("./socketManager");
const { SUSPENSION_NAMESPACE, roomKey } = require("./constants");

const getNamespace = () => {
  try {
    const io = getIo();
    return io.of(SUSPENSION_NAMESPACE);
  } catch (error) {
    console.warn("[SuspensionEmitter] socket server not ready:", error.message);
    return null;
  }
};

const emitToRoom = (suspensionId, event, payload) => {
  const namespace = getNamespace();
  if (!namespace) {
    return;
  }
  namespace.to(roomKey(suspensionId)).emit(event, payload);
};

const emitToNamespace = (event, payload) => {
  const namespace = getNamespace();
  if (!namespace) {
    return;
  }
  namespace.emit(event, payload);
};

const emitSuspensionStatus = (suspension) => {
  if (!suspension?.id) {
    return;
  }
  emitToRoom(suspension.id, "suspension:update", suspension);
};

const emitSuspensionRevoked = (suspension) => {
  if (!suspension?.id) {
    return;
  }
  emitToRoom(suspension.id, "suspension:revoked", suspension);
};

const emitSuspensionMessage = ({ suspensionId, message, unreadCounts }) => {
  if (!suspensionId || !message) {
    return;
  }
  emitToRoom(suspensionId, "suspension:message:new", {
    message,
    unreadCounts,
  });
};

const emitSuspensionReadReceipt = ({
  suspensionId,
  unreadCounts,
  readerRole,
}) => {
  if (!suspensionId) {
    return;
  }
  emitToRoom(suspensionId, "suspension:messages:read", {
    unreadCounts,
    readerRole,
  });
};

const emitAdminDashboardUpdate = (payload) => {
  emitToNamespace("suspension:admin:update", payload);
};

module.exports = {
  emitSuspensionStatus,
  emitSuspensionRevoked,
  emitSuspensionMessage,
  emitSuspensionReadReceipt,
  emitAdminDashboardUpdate,
};
