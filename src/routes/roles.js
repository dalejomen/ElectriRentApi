const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const ROLE_FIELDS = ["code", "name", "description", "active", "system_role"];

function normalizeRolePayload(body = {}) {
  const payload = {};

  for (const field of ROLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "active")) {
    payload.active = payload.active === true || payload.active === "true";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "system_role")) {
    payload.system_role = payload.system_role === true || payload.system_role === "true";
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.roles (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.roles SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/roles:
 *   get:
 *     summary: Listar roles
 *     tags: [Roles]
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         example: ADMIN
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         example: Administrador
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
 *         description: Lista de roles
 */
router.get("/", async (req, res) => {
  try {
    const { code, name, active, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.roles";

    if (code) {
      conditions.push(`code = $${params.length + 1}`);
      params.push(code);
    }

    if (name) {
      conditions.push(`name = $${params.length + 1}`);
      params.push(name);
    }

    if (active !== undefined) {
      conditions.push(`active = $${params.length + 1}`);
      params.push(active === "true" || active === true);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Math.min(Number(limit) || 50, 100));
    params.push(Number(offset) || 0);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Error al listar roles", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/roles/{id}:
 *   get:
 *     summary: Obtener un rol
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: Rol encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.roles WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Rol no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el rol", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/roles:
 *   post:
 *     summary: Crear un rol
 *     tags: [Roles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - name
 *             properties:
 *               code:
 *                 type: string
 *                 example: ADMIN
 *               name:
 *                 type: string
 *                 example: Administrador
 *               description:
 *                 type: string
 *                 example: Rol con permisos administrativos.
 *               active:
 *                 type: boolean
 *                 example: true
 *               system_role:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Rol creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeRolePayload(req.body);

    if (!payload.code || !payload.name) {
      return res.status(400).json({ error: "code y name son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el rol", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/roles/{id}:
 *   put:
 *     summary: Actualizar un rol
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Supervisor
 *               description:
 *                 type: string
 *                 example: Rol de supervisión.
 *               active:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Rol actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeRolePayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Rol no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el rol", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/roles/{id}:
 *   delete:
 *     summary: Eliminar un rol
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: Rol eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.roles WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Rol no encontrado" });
    }

    res.json({ message: "Rol eliminado", data: result.rows[0] });
  } catch (error) {
    res.status(400).json({ error: "Error al eliminar el rol", details: error.message });
  }
});

module.exports = router;
