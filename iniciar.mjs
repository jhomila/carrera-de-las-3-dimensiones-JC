import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import app from './juego.mjs';
import {DatabaseSync} from 'node:sqlite';

const database = new DatabaseSync(':memory:');
database.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));

const DB = {
  prepare(sql) {
    const statement = database.prepare(sql);
    return {
      bind(...values) {
        return {
          first: async () => statement.get(...values),
          run: async () => ({meta:statement.run(...values)})
        };
      }
    };
  },
  async batch(statements) {
    database.exec('BEGIN');
    try {
      const results = await Promise.all(statements.map(statement => statement.run()));
      database.exec('COMMIT');
      return results;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
};

const port = Number(process.env.PORT || 8787);
const local = createServer(async (incoming, outgoing) => {
  try {
    const body = [];
    let size = 0;
    for await (const part of incoming) {
      size += part.length;
      if (size > 2048) {
        outgoing.writeHead(413).end();
        return;
      }
      body.push(part);
    }
    const request = new Request('http://localhost:' + port + incoming.url, {
      method:incoming.method,
      headers:incoming.headers,
      body:body.length ? Buffer.concat(body) : undefined
    });
    const response = await app.fetch(request,{DB});
    outgoing.writeHead(response.status,Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error.message);
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end();
  }
});
local.listen(port,'0.0.0.0',() => console.log('Abre http://localhost:' + port + ' para probar la carrera.'));
