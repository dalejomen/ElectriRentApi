const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const VEHICLE_FIELDS = [
  "user_id",
  "brand",
  "model",
  "version",
  "vehicle_type",
  "manufacture_year",
  "plate",
  "color",
  "battery_capacity_kwh",
  "estimated_range_km",
  "vin",
  "is_default",
  "active"
];

function normalizeVehiclePayload(body = {}) {
  const payload = {};

  for (const field of VEHICLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "is_default")) {
    payload.is_default = payload.is_default === true || payload.is_default === "true";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "active")) {
    payload.active = payload.active === true || payload.active === "true";
  }

  if (Object.prototype.hasOwnProperty.call(payload, "manufacture_year")) {
    payload.manufacture_year = Number(payload.manufacture_year);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "battery_capacity_kwh")) {
    payload.battery_capacity_kwh = Number(payload.battery_capacity_kwh);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "estimated_range_km")) {
    payload.estimated_range_km = Number(payload.estimated_range_km);
  }

  return payload;
}

function buildInsertQuery(payload) {
  const fields = Object.keys(payload);
  const values = fields.map((_, index) => `$${index + 1}`);

  return {
    text: `INSERT INTO public.vehicles (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.vehicles SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/vehicles:
 *   get:
 *     summary: Listar vehículos
 *     tags: [Vehicles]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *       - in: query
 *         name: brand
 *         schema:
 *           type: string
 *         example: Tesla
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
 *         description: Lista de vehículos
 */
router.get("/", async (req, res) => {
  try {
    const { user_id, brand, active, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.vehicles";

    if (user_id) {
      conditions.push(`user_id = $${params.length + 1}`);
      params.push(user_id);
    }

    if (brand) {
      conditions.push(`brand = $${params.length + 1}`);
      params.push(brand);
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
    res.status(500).json({ error: "Error al listar vehículos", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/vehicles/{id}:
 *   get:
 *     summary: Obtener un vehículo
 *     tags: [Vehicles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Vehículo encontrado
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.vehicles WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Vehículo no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el vehículo", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/vehicles:
 *   post:
 *     summary: Crear un vehículo
 *     tags: [Vehicles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - brand
 *               - model
 *               - manufacture_year
 *               - plate
 *             properties:
 *               user_id:
 *                 type: string
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *               brand:
 *                 type: string
 *                 example: Tesla
 *               model:
 *                 type: string
 *                 example: Model 3
 *               version:
 *                 type: string
 *                 example: Long Range
 *               vehicle_type:
 *                 type: string
 *                 example: CAR
 *               manufacture_year:
 *                 type: integer
 *                 example: 2022
 *               plate:
 *                 type: string
 *                 example: ABC123
 *               color:
 *                 type: string
 *                 example: Blanco
 *               battery_capacity_kwh:
 *                 type: number
 *                 example: 75.0
 *               estimated_range_km:
 *                 type: integer
 *                 example: 500
 *               vin:
 *                 type: string
 *                 example: 1HGCM82633A004352
 *               is_default:
 *                 type: boolean
 *                 example: true
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Vehículo creado
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeVehiclePayload(req.body);

    if (!payload.user_id || !payload.brand || !payload.model || !payload.manufacture_year || !payload.plate) {
      return res.status(400).json({ error: "user_id, brand, model, manufacture_year y plate son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear el vehículo", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/vehicles/{id}:
 *   put:
 *     summary: Actualizar un vehículo
 *     tags: [Vehicles]
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
 *               brand:
 *                 type: string
 *                 example: Tesla
 *               model:
 *                 type: string
 *                 example: Model Y
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Vehículo actualizado
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeVehiclePayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Vehículo no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar el vehículo", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/vehicles/{id}:
 *   delete:
 *     summary: Eliminar un vehículo
 *     tags: [Vehicles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Vehículo eliminado
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.vehicles WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Vehículo no encontrado" });
    }

    res.json({ message: "Vehículo eliminado", data: result.rows[0] });
  } catch (error) {
    res.status(400).json({ error: "Error al eliminar el vehículo", details: error.message });
  }
});

module.exports = router;
