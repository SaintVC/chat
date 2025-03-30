import fs from 'fs';
import express from 'express';
import logger from 'morgan';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';
import { Server } from 'socket.io';
import { createServer } from 'node:http';

dotenv.config();  // Carga las variables de entorno

const port = process.env.PORT ?? 3000;

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {}
});

const db = createClient({
  url: 'libsql://gabriel-saintvc.aws-us-east-1.turso.io',
  authToken: process.env.DB_TOKEN
});

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT
  )
`);

io.on('connection', async (socket) => {
  console.log('A user has connected!');

  socket.on('disconnect', () => {
    console.log('A user has disconnected');
  });

  socket.on('chat message', async (msg) => {
    const username = socket.handshake.auth.username ?? 'anonymous';
    console.log({ username });

    try {
      // Guardamos el mensaje en la base de datos
      const result = await db.execute({
        sql: 'INSERT INTO messages (content, user) VALUES (:msg, :username)',
        args: { msg, username }
      });

      // Determinamos el archivo de texto en el que guardaremos el mensaje
      let filePath;
      if (username === 'rivka.brakus') {
        filePath = './chat_novia.txt'; // Archivo para los mensajes de la novia
      } else if (username === 'garfield.herman') {
        filePath = './chat_me.txt'; // Archivo para los mensajes tuyos
      }

      // Guardamos el mensaje en el archivo correspondiente
      fs.appendFileSync(filePath, `${username}: ${msg}\n`);

      // Guardamos los mensajes de los dos usuarios en el archivo chat_conjunto.txt
      if (username === 'rivka.brakus' || username === 'garfield.herman') {
        fs.appendFileSync('./chat_conjunto.txt', `${username}: ${msg}\n`);
      }

      // Emitimos el mensaje al chat
      io.emit('chat message', msg, result.lastInsertRowid.toString(), username);
    } catch (e) {
      console.error(e);
    }
  });

  // Recuperar los mensajes previos
  if (!socket.recovered) { 
    try {
      const results = await db.execute({
        sql: 'SELECT id, content, user FROM messages WHERE id > ?',
        args: [socket.handshake.auth.serverOffset ?? 0]
      });

      results.rows.forEach(row => {
        socket.emit('chat message', row.content, row.id.toString(), row.user);
      });
    } catch (e) {
      console.error(e);
    }
  }
});

app.use(logger('dev'));

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/client/index.html');
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
