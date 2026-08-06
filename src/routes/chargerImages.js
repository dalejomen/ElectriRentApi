const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const CHARGER_IMAGE_FIELDS = [
  "charger_id",
  "file_name",
  "original_name",
  "storage_provider",
  "image_url",
  "thumbnail_url",
  "content_type",
  "file_size",
  "width",
  "height",
  "display_order",
  "is_cover",
  "description",
  "uploaded_by"
];

function parseIntegerValue(value, fieldName) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${fieldName} debe ser un entero válido`);
  }

  return parsed;
}

function parseBigIntValue(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} debe ser un número válido mayor a 0`);
  }

  return parsed;
}

function normalizeChargerImagePayload(body = {}) {
  const payload = {};

  for (const field of CHARGER_IMAGE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "display_order")) {
    payload.display_order = parseIntegerValue(payload.display_order, "display_order");

    if (payload.display_order <= 0) {
      throw new Error("display_order debe ser mayor a 0");
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "file_size")) {
    payload.file_size = parseBigIntValue(payload.file_size, "file_size");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "width")) {
    payload.width = parseIntegerValue(payload.width, "width");

    if (payload.width <= 0) {
      throw new Error("width debe ser mayor a 0");
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "height")) {
    payload.height = parseIntegerValue(payload.height, "height");

    if (payload.height <= 0) {
      throw new Error("height debe ser mayor a 0");
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "is_cover")) {
    payload.is_cover = payload.is_cover === true || payload.is_cover === "true";
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.charger_images (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.charger_images SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} AND deleted_at IS NULL RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/charger-images:
 *   get:
 *     summary: Listar imágenes de cargadores
 *     tags: [ChargerImages]
 *     parameters:
 *       - in: query
 *         name: charger_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: uploaded_by
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174001
 *       - in: query
 *         name: is_cover
 *         schema:
 *           type: boolean
 *         example: true
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
 *         description: Lista de imágenes de cargadores
 */
router.get("/", async (req, res) => {
  try {
    const { charger_id, uploaded_by, is_cover, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.charger_images WHERE deleted_at IS NULL";

    if (charger_id) {
      conditions.push(`charger_id = $${params.length + 1}`);
      params.push(charger_id);
    }

    if (uploaded_by) {
      conditions.push(`uploaded_by = $${params.length + 1}`);
      params.push(uploaded_by);
    }

    if (is_cover !== undefined) {
      conditions.push(`is_cover = $${params.length + 1}`);
      params.push(is_cover === "true" || is_cover === true);
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY display_order ASC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Math.min(Number(limit) || 50, 100));
    params.push(Number(offset) || 0);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Error al listar imágenes de cargadores", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-images/{id}:
 *   get:
 *     summary: Obtener una imagen de cargador
 *     tags: [ChargerImages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Imagen encontrada
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM public.charger_images WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Imagen de cargador no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la imagen de cargador", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-images:
 *   post:
 *     summary: Crear una imagen de cargador
 *     tags: [ChargerImages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - charger_id
 *               - file_name
 *               - image_url
 *               - uploaded_by
 *             properties:
 *               charger_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               file_name:
 *                 type: string
 *                 example: charger-001.jpg
 *               original_name:
 *                 type: string
 *                 example: charger-001.jpg
 *               storage_provider:
 *                 type: string
 *                 example: AZURE_BLOB
 *               image_url:
 *                 type: string
 *                 example: https://storage.example.com/charger-001.jpg
 *               thumbnail_url:
 *                 type: string
 *                 example: https://storage.example.com/charger-001-thumb.jpg
 *               content_type:
 *                 type: string
 *                 example: image/jpeg
 *               file_size:
 *                 type: integer
 *                 example: 245760
 *               width:
 *                 type: integer
 *                 example: 1200
 *               height:
 *                 type: integer
 *                 example: 800
 *               display_order:
 *                 type: integer
 *                 example: 1
 *               is_cover:
 *                 type: boolean
 *                 example: true
 *               description:
 *                 type: string
 *                 example: Imagen principal del cargador
 *               uploaded_by:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *     responses:
 *       201:
 *         description: Imagen de cargador creada
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeChargerImagePayload(req.body);

    if (!payload.charger_id || !payload.file_name || !payload.image_url || !payload.uploaded_by) {
      return res.status(400).json({ error: "charger_id, file_name, image_url y uploaded_by son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear la imagen de cargador", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-images/{id}:
 *   put:
 *     summary: Actualizar una imagen de cargador
 *     tags: [ChargerImages]
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
 *               description:
 *                 type: string
 *                 example: Imagen actualizada del cargador
 *               is_cover:
 *                 type: boolean
 *                 example: false
 *               display_order:
 *                 type: integer
 *                 example: 2
 *     responses:
 *       200:
 *         description: Imagen de cargador actualizada
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeChargerImagePayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Imagen de cargador no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar la imagen de cargador", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/charger-images/{id}:
 *   delete:
 *     summary: Eliminar una imagen de cargador
 *     tags: [ChargerImages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Imagen de cargador eliminada
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE public.charger_images SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *",
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Imagen de cargador no encontrada" });
    }

    res.json({ message: "Imagen de cargador eliminada correctamente", chargerImage: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar la imagen de cargador", details: error.message });
  }
});

module.exports = router;
