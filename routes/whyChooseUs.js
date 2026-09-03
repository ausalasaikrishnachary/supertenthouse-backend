const express = require("express");
const router = express.Router();

// Mock data
const whyChooseUs = [
  {
    id: 1,
    icon: "award",
    title: "Best Quality",
    description: "We use only the finest materials for your events.",
  },
  {
    id: 2,
    icon: "users",
    title: "Experienced Team",
    description: "Our professionals have handled 1000+ events.",
  },
  {
    id: 3,
    icon: "shield",
    title: "100% Safe",
    description: "All our equipment is safety-certified.",
  },
];

router.get("/", (req, res) => {
  res.json(whyChooseUs);
});

module.exports = router;