const jwt = require("jsonwebtoken");
const suspensionService = require("../services/suspensionService");
const config = require("../config/config");

const { SUSPENSION_NAMESPACE, roomKey } = require("./constants");

const resolveRole = (tokenType) => (tokenType === "admin" ? "admin" : "user");

const registerSuspensionGateway = (io) => {
  const namespace = io.of(SUSPENSION_NAMESPACE);

  namespace.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error("Authentication token is required"));
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      socket.data.userId = decoded.id;
      socket.data.tokenType = decoded.type;
      socket.data.role = resolveRole(decoded.type);
      next();
    } catch (error) {
      console.error("[SuspensionGateway] Auth error:", error.message);
      next(new Error("Invalid or expired token"));
    }
  });

  namespace.on("connection", (socket) => {
    console.log(
      `[SuspensionGateway] client connected: ${socket.id} (role: ${socket.data.role})`
    );

    socket.on("suspension:join", async ({ suspensionId } = {}, ack) => {
      try {
        if (!suspensionId) {
          throw new Error("suspensionId is required");
        }

        await suspensionService.validateSuspensionAccess({
          suspensionId,
          role: socket.data.role,
          userId: socket.data.userId,
        });

        socket.join(roomKey(suspensionId));
        console.log(
          `[SuspensionGateway] ${socket.id} joined suspension ${suspensionId}`
        );

        if (typeof ack === "function") {
          ack({ success: true });
        }
      } catch (error) {
        console.error(
          "[SuspensionGateway] join error:",
          error.message || error
        );
        if (typeof ack === "function") {
          ack({ success: false, message: error.message });
        }
      }
    });

    socket.on("suspension:leave", ({ suspensionId } = {}, ack) => {
      if (!suspensionId) {
        if (typeof ack === "function") {
          ack({ success: false, message: "suspensionId is required" });
        }
        return;
      }

      socket.leave(roomKey(suspensionId));
      console.log(
        `[SuspensionGateway] ${socket.id} left suspension ${suspensionId}`
      );
      if (typeof ack === "function") {
        ack({ success: true });
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(
        `[SuspensionGateway] client disconnected: ${socket.id} | reason: ${reason}`
      );
    });
  });
};

module.exports = { registerSuspensionGateway };
