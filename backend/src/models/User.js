import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 2,
      maxlength: 30
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    passwordHash: {
      type: String,
      required: false
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local"
    },
    picture: {
      type: String
    },
    role: {
      type: String,
      enum: ['interviewer', 'candidate'],
      required: true,
      default: 'candidate'
    }
  },
  { timestamps: true }
);

userSchema.statics.hashPassword = async function (plain) {
  return bcrypt.hash(plain, 12);
};

userSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    username: this.username,
    email: this.email,
    role: this.role,
    picture: this.picture || null,
    authProvider: this.authProvider || "local",
    createdAt: this.createdAt
  };
};

const User = mongoose.model("User", userSchema);
export default User;
