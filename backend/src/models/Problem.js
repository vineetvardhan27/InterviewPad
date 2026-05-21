import mongoose from "mongoose";

const problemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    constraints: { type: String, default: "" },
    samples: [
      {
        input: { type: String, default: "" },
        output: { type: String, default: "" }
      }
    ]
  },
  { timestamps: true }
);

const Problem = mongoose.model("Problem", problemSchema);
export default Problem;
