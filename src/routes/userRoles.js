const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const USER_ROLE_FIELDS = ["user_id", "role_id", "assigned_by", "active"];

function normalizeUserRolePayload(body = {}) {
  const payload = {};

  for (const field of USER_ROLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
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
    text: `INSERT INTO public.user_roles (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.user_roles SET ${assignments.join(", ")} WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/user-roles:
 *   get:
 *     summary: Listar vínculos de usuario-rol
 *     tags: [UserRoles]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: role_id
 *         schema:
 *           type: integer
 *         example: 2
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
 *         description: Lista de vínculos de usuario-rol
 */
router.get("/", async (req, res) => {
  try {
    const { user_id, role_id, active, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.user_roles";

    if (user_id) {
      conditions.push(`user_id = $${params.length + 1}`);
      params.push(user_id);
    }

    if (role_id !== undefined) {
      conditions.push(`role_id = $${params.length + 1}`);
      params.push(Number(role_id));
    }

    if (active !== undefined) {
      conditions.push(`active = $${params.length + 1}`);
      params.push(active === "true" || active === true);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY assigned_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Math.min(Number(limit) || 50, 100));
    params.push(Number(offset) || 0);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Error al listar vínculos de usuario-rol", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/user-roles/{id}:
 *   get:
 *     summary: Obtener un vínculo de usuario-rol
 *     tags: [UserRoles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Vínculo encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.user_roles WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Vínculo de usuario-rol no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el vínculo de usuario-rol", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/user-roles:
 *   post:
 *     summary: Crear un vínculo de usuario-rol
 *     tags: [UserRoles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - role_id
 *             properties:
 *               user_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               role_id:
 *                 type: integer
 *                 example: 2
 *               assigned_by:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Vínculo creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeUserRolePayload(req.body);

    if (!payload.user_id || payload.role_id === undefined) {
      return res.status(400).json({ error: "user_id y role_id son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el vínculo de usuario-rol", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/user-roles/{id}:
 *   put:
 *     summary: Actualizar un vínculo de usuario-rol
 *     tags: [UserRoles]
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
 *               active:
 *                 type: boolean
 *                 example: false
 *               assigned_by:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174001
 *     responses:
 *       200:
 *         description: Vínculo actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeUserRolePayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Vínculo de usuario-rol no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el vínculo de usuario-rol", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/user-roles/{id}:
 *   delete:
 *     summary: Eliminar un vínculo de usuario-rol
 *     tags: [UserRoles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Vínculo eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.user_roles WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Vínculo de usuario-rol no encontrado" });
    }

    res.json({ message: "Vínculo de usuario-rol eliminado", data: result.rows[0] });
  } catch (error) {
    res.status(400).json({ error: "Error al eliminar el vínculo de usuario-rol", details: error.message });
  }
});

module.exports = router;
