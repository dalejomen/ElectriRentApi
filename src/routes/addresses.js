const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const ADDRESS_FIELDS = [
  "country",
  "state",
  "city",
  "neighborhood",
  "address_line1",
  "address_line2",
  "postal_code",
  "latitude",
  "longitude",
  "reference",
  "is_verified"
];

function parseNumeric(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} debe ser un número válido`);
  }

  return parsed;
}

function normalizeAddressPayload(body = {}) {
  const payload = {};

  for (const field of ADDRESS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "latitude")) {
    payload.latitude = parseNumeric(payload.latitude, "latitude");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "longitude")) {
    payload.longitude = parseNumeric(payload.longitude, "longitude");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "is_verified")) {
    payload.is_verified = payload.is_verified === true || payload.is_verified === "true";
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.addresses (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.addresses SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} AND deleted_at IS NULL RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/addresses:
 *   get:
 *     summary: Listar direcciones
 *     tags: [Addresses]
 *     parameters:
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         example: Colombia
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         example: Bogotá
 *       - in: query
 *         name: is_verified
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
 *         description: Lista de direcciones
 */
router.get("/", async (req, res) => {
  try {
    const { country, city, is_verified, limit = "50", offset = "0" } = req.query;
    const params = [];
    let query = "SELECT * FROM public.addresses WHERE deleted_at IS NULL";

    if (country) {
      query += ` AND country ILIKE $${params.length + 1}`;
      params.push(`%${country}%`);
    }

    if (city) {
      query += ` AND city ILIKE $${params.length + 1}`;
      params.push(`%${city}%`);
    }

    if (is_verified !== undefined) {
      query += ` AND is_verified = $${params.length + 1}`;
      params.push(is_verified === "true");
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Math.min(Number(limit) || 50, 100));
    params.push(Number(offset) || 0);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Error al listar direcciones", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/addresses/{id}:
 *   get:
 *     summary: Obtener una dirección
 *     tags: [Addresses]
 *     responses:
 *       200:
 *         description: Dirección encontrada
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM public.addresses WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Dirección no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la dirección", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/addresses:
 *   post:
 *     summary: Crear una dirección
 *     tags: [Addresses]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - country
 *               - city
 *               - address_line1
 *               - latitude
 *               - longitude
 *             properties:
 *               country:
 *                 type: string
 *                 example: Colombia
 *               state:
 *                 type: string
 *                 example: Cundinamarca
 *               city:
 *                 type: string
 *                 example: Bogotá
 *               neighborhood:
 *                 type: string
 *                 example: Chapinero
 *               address_line1:
 *                 type: string
 *                 example: Calle 100 # 15-20
 *               address_line2:
 *                 type: string
 *                 example: Apto 302
 *               postal_code:
 *                 type: string
 *                 example: 110111
 *               latitude:
 *                 type: number
 *                 example: 4.710989
 *               longitude:
 *                 type: number
 *                 example: -74.07209
 *               reference:
 *                 type: string
 *                 example: Prueba
 *               is_verified:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Dirección creada
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeAddressPayload(req.body);

    if (!payload.country || !payload.city || !payload.address_line1 || payload.latitude === undefined || payload.longitude === undefined) {
      return res.status(400).json({ error: "country, city, address_line1, latitude y longitude son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear la dirección", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/addresses/{id}:
 *   put:
 *     summary: Actualizar una dirección
 *     tags: [Addresses]
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
 *               country:
 *                 type: string
 *                 example: Colombia
 *               city:
 *                 type: string
 *                 example: Bogotá
 *               address_line1:
 *                 type: string
 *                 example: Carrera 7 # 45-67
 *               latitude:
 *                 type: number
 *                 example: 4.710989
 *               longitude:
 *                 type: number
 *                 example: -74.07209
 *               reference:
 *                 type: string
 *                 example: Prueba actualizada
 *               is_verified:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Dirección actualizada
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeAddressPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Dirección no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar la dirección", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/addresses/{id}:
 *   delete:
 *     summary: Eliminar una dirección
 *     tags: [Addresses]
 *     responses:
 *       200:
 *         description: Dirección eliminada
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE public.addresses SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *",
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Dirección no encontrada" });
    }

    res.json({ message: "Dirección eliminada correctamente", address: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar la dirección", details: error.message });
  }
});

module.exports = router;
