const express = require("express");
const router = express.Router();

// Mock data
const testimonials = [
  {
    id: 1,
    text: "Amazing service! The tent decoration was perfect.",
    name: "Priya Sharma",
    event: "Wedding",
    avatar: "https://example.com/avatar1.jpg",
  },
  {
    id: 2,
    text: "Very professional and reliable team.",
    name: "Rahul Verma",
    event: "Birthday Party",
    avatar: "https://example.com/avatar2.jpg",
  },
];

router.get("/", (req, res) => {
  res.json(testimonials);
});

module.exports = router;