import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: { type: String, required: true },
    text: { type: String, required: true, maxlength: 2000 },
    timestamp: { type: Date, default: Date.now }
  },
  { _id: true }
);

const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    users: {
      type: [String],
      default: []
    },
    host: {
      type: String,
      required: true
    },
    question: {
      type: String,
      default: ""
    },
    code: {
      type: String,
      default: "# Write your solution here\n"
    },
    language: {
      type: String,
      default: "cpp"
    },
    version: {
      type: Number,
      default: 0
    },
    messages: {
      type: [messageSchema],
      default: []
    }
  },
  { timestamps: true }
);

roomSchema.methods.toClient = function () {
  return {
    roomId: this.roomId,
    code: this.code,
    language: this.language,
    users: this.users,
    host: this.host,
    question: this.question,
    version: this.version,
    messages: this.messages.map((m) => ({
      id: m._id.toString(),
      sender: m.sender,
      text: m.text,
      timestamp: m.timestamp.toISOString()
    }))
  };
};

const Room = mongoose.model("Room", roomSchema);
export default Room;
