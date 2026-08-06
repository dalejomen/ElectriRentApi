const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const MESSAGE_ATTACHMENT_FIELDS = [
  "message_id",
  "file_name",
  "content_type",
  "file_size",
  "file_url",
  "thumbnail_url"
];

function normalizeMessageAttachmentPayload(body = {}) {
  const payload = {};

  for (const field of MESSAGE_ATTACHMENT_FIELDS) {
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
    text: `INSERT INTO public.message_attachments (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.message_attachments SET ${assignments.join(", ")} WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/message-attachments:
 *   get:
 *     summary: Listar adjuntos de mensajes
 *     tags: [MessageAttachments]
 *     parameters:
 *       - in: query
 *         name: message_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: file_name
 *         schema:
 *           type: string
 *         example: photo.jpg
 *       - in: query
 *         name: content_type
 *         schema:
 *           type: string
 *         example: image/jpeg
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
 *         description: Lista de adjuntos de mensajes
 */
router.get("/", async (req, res) => {
  try {
    const { message_id, file_name, content_type, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.message_attachments";

    if (message_id) {
      conditions.push(`message_id = $${params.length + 1}`);
      params.push(message_id);
    }

    if (file_name) {
      conditions.push(`file_name ILIKE $${params.length + 1}`);
      params.push(`%${file_name}%`);
    }

    if (content_type) {
      conditions.push(`content_type ILIKE $${params.length + 1}`);
      params.push(`%${content_type}%`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Math.min(Number(limit) || 50, 100));
    params.push(Number(offset) || 0);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Error al listar adjuntos de mensajes", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/message-attachments/{id}:
 *   get:
 *     summary: Obtener un adjunto de mensaje
 *     tags: [MessageAttachments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Adjunto encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.message_attachments WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Adjunto no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el adjunto", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/message-attachments:
 *   post:
 *     summary: Crear un adjunto de mensaje
 *     tags: [MessageAttachments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message_id
 *               - file_name
 *               - file_url
 *             properties:
 *               message_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               file_name:
 *                 type: string
 *                 example: photo.jpg
 *               content_type:
 *                 type: string
 *                 example: image/jpeg
 *               file_size:
 *                 type: integer
 *                 example: 2048
 *               file_url:
 *                 type: string
 *                 example: https://cdn.example.com/files/photo.jpg
 *               thumbnail_url:
 *                 type: string
 *                 example: https://cdn.example.com/files/photo-thumb.jpg
 *     responses:
 *       201:
 *         description: Adjunto creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeMessageAttachmentPayload(req.body);

    if (!payload.message_id || !payload.file_name || !payload.file_url) {
      return res.status(400).json({ error: "message_id, file_name y file_url son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el adjunto", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/message-attachments/{id}:
 *   put:
 *     summary: Actualizar un adjunto de mensaje
 *     tags: [MessageAttachments]
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
 *               file_name:
 *                 type: string
 *                 example: updated-photo.jpg
 *               content_type:
 *                 type: string
 *                 example: image/png
 *               file_url:
 *                 type: string
 *                 example: https://cdn.example.com/files/updated-photo.png
 *     responses:
 *       200:
 *         description: Adjunto actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeMessageAttachmentPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Adjunto no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el adjunto", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/message-attachments/{id}:
 *   delete:
 *     summary: Eliminar un adjunto de mensaje
 *     tags: [MessageAttachments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Adjunto eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.message_attachments WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Adjunto no encontrado" });
    }

    res.json({ message: "Adjunto eliminado correctamente", attachment: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar el adjunto", details: error.message });
  }
});

module.exports = router;
