const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const MESSAGE_READ_FIELDS = [
  "message_id",
  "user_id",
  "read_at"
];

function normalizeMessageReadPayload(body = {}) {
  const payload = {};

  for (const field of MESSAGE_READ_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.message_reads (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.message_reads SET ${assignments.join(", ")} WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/message-reads:
 *   get:
 *     summary: Listar lecturas de mensajes
 *     tags: [MessageReads]
 *     parameters:
 *       - in: query
 *         name: message_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174001
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         example: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         example: 0
 *     responses:
 *       200:
 *         description: Lista de lecturas de mensajes
 */
router.get("/", async (req, res) => {
  try {
    const { message_id, user_id, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.message_reads";

    if (message_id) {
      conditions.push(`message_id = $${params.length + 1}`);
      params.push(message_id);
    }

    if (user_id) {
      conditions.push(`user_id = $${params.length + 1}`);
      params.push(user_id);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY read_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Math.min(Number(limit) || 50, 100));
    params.push(Number(offset) || 0);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Error al listar lecturas de mensajes", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/message-reads/{id}:
 *   get:
 *     summary: Obtener una lectura de mensaje
 *     tags: [MessageReads]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Lectura encontrada
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.message_reads WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Lectura no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la lectura", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/message-reads:
 *   post:
 *     summary: Crear una lectura de mensaje
 *     tags: [MessageReads]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message_id
 *               - user_id
 *             properties:
 *               message_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               user_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               read_at:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-05T12:00:00Z
 *     responses:
 *       201:
 *         description: Lectura creada
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeMessageReadPayload(req.body);

    if (!payload.message_id || !payload.user_id) {
      return res.status(400).json({ error: "message_id y user_id son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear la lectura", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/message-reads/{id}:
 *   put:
 *     summary: Actualizar una lectura de mensaje
 *     tags: [MessageReads]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               read_at:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-05T13:00:00Z
 *     responses:
 *       200:
 *         description: Lectura actualizada
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeMessageReadPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Lectura no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar la lectura", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/message-reads/{id}:
 *   delete:
 *     summary: Eliminar una lectura de mensaje
 *     tags: [MessageReads]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Lectura eliminada
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.message_reads WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Lectura no encontrada" });
    }

    res.json({ message: "Lectura eliminada correctamente", messageRead: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar la lectura", details: error.message });
  }
});

module.exports = router;
