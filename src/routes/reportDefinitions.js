const express = require("express");
const { pool } = require("../config/postgres");

const router = express.Router();

const REPORT_DEFINITION_FIELDS = [
  "code",
  "name",
  "description",
  "category",
  "sql_name",
  "parameters",
  "active"
];

function normalizeReportDefinitionPayload(body = {}) {
  const payload = {};

  for (const field of REPORT_DEFINITION_FIELDS) {
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
    text: `INSERT INTO public.report_definitions (${fields.join(",")}) VALUES (${values.join(",")}) RETURNING *`,
    values: fields.map((field) => payload[field])
  };
}

function buildUpdateQuery(id, payload) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);

  return {
    text: `UPDATE public.report_definitions SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    values: [...fields.map((field) => payload[field]), id]
  };
}

/**
 * @openapi
 * /api/v1/report-definitions:
 *   get:
 *     summary: Listar definiciones de reportes
 *     tags: [ReportDefinitions]
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         example: CHARGERS_SUMMARY
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         example: Resumen de cargadores
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         example: CHARGERS
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
 *         description: Lista de definiciones de reportes
 */
router.get("/", async (req, res) => {
  try {
    const { code, name, category, active, limit = "50", offset = "0" } = req.query;
    const params = [];
    const conditions = [];
    let query = "SELECT * FROM public.report_definitions";

    if (code) {
      conditions.push(`code ILIKE $${params.length + 1}`);
      params.push(`%${code}%`);
    }

    if (name) {
      conditions.push(`name ILIKE $${params.length + 1}`);
      params.push(`%${name}%`);
    }

    if (category) {
      conditions.push(`category ILIKE $${params.length + 1}`);
      params.push(`%${category}%`);
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
    res.status(500).json({ error: "Error al listar definiciones de reportes", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-definitions/{id}:
 *   get:
 *     summary: Obtener una definición de reporte
 *     tags: [ReportDefinitions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Definición encontrada
 */
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM public.report_definitions WHERE id = $1", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Definición no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la definición", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-definitions:
 *   post:
 *     summary: Crear una definición de reporte
 *     tags: [ReportDefinitions]
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
 *                 example: CHARGERS_SUMMARY
 *               name:
 *                 type: string
 *                 example: Resumen de cargadores
 *               description:
 *                 type: string
 *                 example: Reporte con métricas de cargadores
 *               category:
 *                 type: string
 *                 example: CHARGERS
 *               sql_name:
 *                 type: string
 *                 example: chargers_summary
 *               parameters:
 *                 type: object
 *                 example: {"date_from":"2026-01-01","date_to":"2026-01-31"}
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Definición creada
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeReportDefinitionPayload(req.body);

    if (!payload.code || !payload.name) {
      return res.status(400).json({ error: "code y name son obligatorios" });
    }

    const query = buildInsertQuery(payload);
    const result = await pool.query(query.text, query.values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al crear la definición", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-definitions/{id}:
 *   put:
 *     summary: Actualizar una definición de reporte
 *     tags: [ReportDefinitions]
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
 *               name:
 *                 type: string
 *                 example: Definición actualizada
 *               active:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Definición actualizada
 */
router.put("/:id", async (req, res) => {
  try {
    const payload = normalizeReportDefinitionPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = buildUpdateQuery(req.params.id, payload);
    const result = await pool.query(query.text, query.values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Definición no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: "Error al actualizar la definición", details: error.message });
  }
});

/**
 * @openapi
 * /api/v1/report-definitions/{id}:
 *   delete:
 *     summary: Eliminar una definición de reporte
 *     tags: [ReportDefinitions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Definición eliminada
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM public.report_definitions WHERE id = $1 RETURNING *", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Definición no encontrada" });
    }

    res.json({ message: "Definición eliminada correctamente", reportDefinition: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar la definición", details: error.message });
  }
});

module.exports = router;
