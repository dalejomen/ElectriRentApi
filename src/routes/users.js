const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const USER_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "password_hash",
  "profile_photo_url",
  "birth_date",
  "language",
  "timezone",
  "status",
  "email_verified",
  "phone_verified",
  "two_factor_enabled",
  "last_login_at",
  "login_attempts",
  "locked_until",
  "active"
];

function normalizeUserPayload(body = {}) {
  const payload = {};

  for (const field of USER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "email_verified")) {
    payload.email_verified = payload.email_verified === true || payload.email_verified === "true";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "phone_verified")) {
    payload.phone_verified = payload.phone_verified === true || payload.phone_verified === "true";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "two_factor_enabled")) {
    payload.two_factor_enabled = payload.two_factor_enabled === true || payload.two_factor_enabled === "true";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "active")) {
    payload.active = payload.active === true || payload.active === "true";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "login_attempts")) {
    payload.login_attempts = Number(payload.login_attempts);
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.users (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.users SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/users:
 *   get:
 *     summary: Listar usuarios
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         example: user@example.com
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         example: ACTIVE
 *       - in: query
 *         name: active
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
 *         description: Lista de usuarios
 */
router.get("/", async (req, res) => {
  try {
    const { email, status, active, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.users";

    if (email) {
      conditions.push(`email = $${params.length + 1}`);
      params.push(email);
    }

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (active !== undefined) {
      conditions.push(`active = $${params.length + 1}`);
      params.push(active === "true" || active === true);
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
    res.status(500).json({ error: "Error al listar usuarios", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/users/{id}:
 *   get:
 *     summary: Obtener un usuario
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Usuario encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.users WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el usuario", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/users:
 *   post:
 *     summary: Crear un usuario
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - first_name
 *               - last_name
 *               - email
 *             properties:
 *               first_name:
 *                 type: string
 *                 example: Ana
 *               last_name:
 *                 type: string
 *                 example: García
 *               email:
 *                 type: string
 *                 example: ana@example.com
 *               phone:
 *                 type: string
 *                 example: +573001112233
 *               password_hash:
 *                 type: string
 *                 example: hash123
 *               profile_photo_url:
 *                 type: string
 *                 example: https://example.com/avatar.png
 *               birth_date:
 *                 type: string
 *                 format: date
 *               language:
 *                 type: string
 *                 example: ES
 *               timezone:
 *                 type: string
 *                 example: America/Bogota
 *               status:
 *                 type: string
 *                 example: ACTIVE
 *               email_verified:
 *                 type: boolean
 *                 example: false
 *               phone_verified:
 *                 type: boolean
 *                 example: false
 *               two_factor_enabled:
 *                 type: boolean
 *                 example: false
 *               login_attempts:
 *                 type: integer
 *                 example: 0
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Usuario creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeUserPayload(req.body);

    if (!payload.first_name || !payload.last_name || !payload.email) {
      return res.status(400).json({ error: "first_name, last_name y email son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el usuario", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/users/{id}:
 *   put:
 *     summary: Actualizar un usuario
 *     tags: [Users]
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
 *               first_name:
 *                 type: string
 *                 example: Ana Maria
 *               last_name:
 *                 type: string
 *                 example: García
 *               phone:
 *                 type: string
 *                 example: +573001112233
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Usuario actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeUserPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el usuario", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/users/{id}:
 *   delete:
 *     summary: Eliminar un usuario
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Usuario eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.users WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json({ message: "Usuario eliminado", data: result.rows[0] });
  } catch (error) {
    res.status(400).json({ error: "Error al eliminar el usuario", details: error.message });
  }
});

module.exports = router;
