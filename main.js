const WebSocketServer = require("ws").Server;
const Session = require("./session");
const Client = require("./client");

const PORT = process.env.PORT || 90;

const server = new WebSocketServer({ port: PORT });

const sessions = new Map();

function createId(len = 6, chars = "abcdefghjkmnopqrstwxyz0123456789") {
  let id = "";
  while (len--) {
    id += chars[(Math.random() * chars.length) | 0];
  }

  return id;
}

function createClient(conn, id = createId()) {
  return new Client(conn, id);
}

function createSessions(id = createId()) {
  if (sessions.has(id)) {
    throw new Error(`Session ${id} already exist`);
  }

  const session = new Session(id);
  // console.log("Creating session", session);
  sessions.set(id, session);

  return session;
}

function getSession(id) {
  return sessions.get(id);
}

function broadcastSession(session) {
  const clients = [...session.clients];
  clients.forEach((client) => {
    client.send({
      type: "session-broadcast",
      peers: {
        you: client.id,
        clients: clients.map((client) => {
          return { id: client.id, state: client.state };
        }),
      },
    });
  });
}

server.on("connection", (conn) => {
  // console.log("Connection established");
  const client = createClient(conn);

  conn.on("message", (data) => {
    const receivedData = JSON.parse(data);

    // console.log(receivedData);

    if (receivedData.type === "create-session") {
      const session = createSessions();
      session.join(client);
      client.state = receivedData.state;

      const sendData = {
        type: "session-created",
        id: session.id,
      };
      client.send(sendData);
    } else if (receivedData.type === "join-session") {
      const session =
        getSession(receivedData.id) || createSessions(receivedData.id);
      session.join(client);
      client.state = receivedData.state;

      broadcastSession(session);
    } else if (receivedData.type === "state-update") {
      const [prop, value] = receivedData.state;
      client.state[receivedData.fragment][prop] = value;
      client.broadcast(receivedData);
    }
  });

  conn.on("close", () => {
    const session = client.session;
    if (session) {
      session.leave(client);
      if (session.clients.size === 0) {
        sessions.delete(session.id);
      }
    }
    broadcastSession(session);
  });
});
