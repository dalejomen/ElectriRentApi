const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const HOST_FIELDS = [
  "user_id",
  "address_id",
  "company_name",
  "legal_name",
  "tax_id",
  "description",
  "website",
  "logo_url",
  "phone",
  "email",
  "verified",
  "verification_date",
  "rating",
  "total_reviews",
  "total_chargers",
  "total_bookings",
  "total_energy_kwh",
  "total_income",
  "status",
  "active"
];

function normalizeHostPayload(body = {}) {
  const payload = {};

  for (const field of HOST_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "verified")) {
    payload.verified = payload.verified === true || payload.verified === "true";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "active")) {
    payload.active = payload.active === true || payload.active === "true";
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.hosts (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.hosts SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} AND deleted_at IS NULL RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/hosts:
 *   get:
 *     summary: Listar hosts
 *     tags: [Hosts]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: address_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174001
 *       - in: query
 *         name: verified
 *         schema:
 *           type: boolean
 *         example: true
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         example: APPROVED
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         example: true
 *       - in: query
 *         name: company_name
 *         schema:
 *           type: string
 *         example: ElectriRent
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         example: host@electrirent.com
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
 *         description: Lista de hosts
 */
router.get("/", async (req, res) => {
  try {
    const {
      user_id,
      address_id,
      verified,
      status,
      active,
      company_name,
      legal_name,
      email,
      limit = "50",
      offset = "0"
    } = req.query;

    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.hosts WHERE deleted_at IS NULL";

    if (user_id) {
      conditions.push(`user_id = $${params.length + 1}`);
      params.push(user_id);
    }

    if (address_id) {
      conditions.push(`address_id = $${params.length + 1}`);
      params.push(address_id);
    }

    if (verified !== undefined) {
      conditions.push(`verified = $${params.length + 1}`);
      params.push(verified === "true" || verified === true);
    }

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (active !== undefined) {
      conditions.push(`active = $${params.length + 1}`);
      params.push(active === "true" || active === true);
    }

    if (company_name) {
      conditions.push(`company_name ILIKE $${params.length + 1}`);
      params.push(`%${company_name}%`);
    }

    if (legal_name) {
      conditions.push(`legal_name ILIKE $${params.length + 1}`);
      params.push(`%${legal_name}%`);
    }

    if (email) {
      conditions.push(`email ILIKE $${params.length + 1}`);
      params.push(`%${email}%`);
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Math.min(Number(limit) || 50, 100));
    params.push(Number(offset) || 0);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Error al listar hosts", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/hosts/{id}:
 *   get:
 *     summary: Obtener un host
 *     tags: [Hosts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Host encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.hosts WHERE id = $1 AND deleted_at IS NULL", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Host no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el host", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/hosts:
 *   post:
 *     summary: Crear un host
 *     tags: [Hosts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *             properties:
 *               user_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               address_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               company_name:
 *                 type: string
 *                 example: ElectriRent
 *               legal_name:
 *                 type: string
 *                 example: ElectriRent S.A.
 *               tax_id:
 *                 type: string
 *                 example: 123456789
 *               description:
 *                 type: string
 *                 example: Plataforma de carga eléctrica
 *               website:
 *                 type: string
 *                 example: https://electrirent.com
 *               logo_url:
 *                 type: string
 *                 example: https://electrirent.com/logo.png
 *               phone:
 *                 type: string
 *                 example: +34600111222
 *               email:
 *                 type: string
 *                 example: host@electrirent.com
 *               verified:
 *                 type: boolean
 *                 example: false
 *               verification_date:
 *                 type: string
 *                 format: date-time
 *               rating:
 *                 type: number
 *                 example: 4.8
 *               total_reviews:
 *                 type: integer
 *                 example: 12
 *               total_chargers:
 *                 type: integer
 *                 example: 4
 *               total_bookings:
 *                 type: integer
 *                 example: 10
 *               total_energy_kwh:
 *                 type: number
 *                 example: 125.5
 *               total_income:
 *                 type: number
 *                 example: 2500.75
 *               status:
 *                 type: string
 *                 example: PENDING
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Host creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeHostPayload(req.body);

    if (!payload.user_id) {
      return res.status(400).json({ error: "user_id es obligatorio" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el host", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/hosts/{id}:
 *   put:
 *     summary: Actualizar un host
 *     tags: [Hosts]
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
 *               company_name:
 *                 type: string
 *                 example: ElectriRent Actualizado
 *               status:
 *                 type: string
 *                 example: APPROVED
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Host actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeHostPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Host no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el host", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/hosts/{id}:
 *   delete:
 *     summary: Eliminar un host
 *     tags: [Hosts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Host eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE public.hosts SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *",
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Host no encontrado" });
    }

    res.json({ message: "Host eliminado correctamente", host: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar el host", details: error.message });
  }
});

module.exports = router;
