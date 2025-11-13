const { Server } = require("socket.io");

let ioInstance = null;

const createDefaultOptions = () => ({
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    credentials: true,
  },
});

const initSocketServer = (httpServer, options = {}) => {
  if (ioInstance) {
    return ioInstance;
  }

  const mergedOptions = {
    ...createDefaultOptions(),
    ...options,
  };

  ioInstance = new Server(httpServer, mergedOptions);

  ioInstance.on("connection", (socket) => {
    console.log(
      `🔌 Socket connected: ${socket.id} (transport: ${socket.conn?.transport?.name})`
    );

    socket.on("disconnect", (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.id} | Reason: ${reason}`);
    });
  });

  return ioInstance;
};

const getIo = () => {
  if (!ioInstance) {
    throw new Error("Socket.io has not been initialized yet.");
  }
  return ioInstance;
};

module.exports = {
  initSocketServer,
  getIo,
};
