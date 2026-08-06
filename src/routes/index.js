const express = require("express");
const router = express.Router();
const addressesRoutes = require("./addresses");
const bookingHistoryRoutes = require("./bookingHistory");
const bookingsRoutes = require("./bookings");
const chargerConnectorsRoutes = require("./chargerConnectors");

/**
 * @openapi
 * /api/v1/health:
 *   get:
 *     summary: Health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API funcionando correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 service:
 *                   type: string
 */
router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "ElectriRent API" });
});

/**
 * @openapi
 * /api/v1/vehicles:
 *   get:
 *     summary: Listar vehículos
 *     tags: [Vehicles]
 *     responses:
 *       200:
 *         description: Lista de vehículos disponibles
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   model:
 *                     type: string
 *                   chargeLevel:
 *                     type: integer
 */
router.get("/vehicles", (req, res) => {
  res.json([
    { id: "v1", model: "Tesla Model 3", chargeLevel: 85 },
    { id: "v2", model: "Nissan Leaf", chargeLevel: 62 }
  ]);
});

router.use("/addresses", addressesRoutes);
router.use("/booking-history", bookingHistoryRoutes);
router.use("/bookings", bookingsRoutes);
router.use("/charger-connectors", chargerConnectorsRoutes);

module.exports = router;
