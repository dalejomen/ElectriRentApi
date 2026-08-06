const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "ElectriRent API",
      version: "1.0.0",
      description: "API REST para gestionar alquileres de vehículos eléctricos."
    },
    servers: [{ url: "http://localhost:3000" }],
    tags: [{ name: "Health" }, { name: "Vehicles" }, { name: "Addresses" }, { name: "BookingHistory" }, { name: "Bookings" }, { name: "ChargerConnectors" }, { name: "ChargerImages" }, { name: "ChargerPriceRules" }]
  },
  apis: ["./src/routes/*.js"]
};

module.exports = swaggerJsdoc(options);
