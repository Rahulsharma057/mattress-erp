const asyncHandler = require("express-async-handler");
const User = require("../models/User");

// @desc   Create a new user (Super Admin assigns role + module permissions)
// @route  POST /api/users
// @access Private (super_admin)
const createUser = asyncHandler(async (req, res) => {
  const { name, email, phone, password, role, permissions } = req.body;

  const exists = await User.findOne({ email });
  if (exists) {
    res.status(400);
    throw new Error("A user with this email already exists");
  }

  const user = await User.create({ name, email, phone, password, role, permissions });
  res.status(201).json(user);
});

// @desc   List all users
// @route  GET /api/users
// @access Private (super_admin, admin)
const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select("-password");
  res.json(users);
});

// @desc   Update a user (role, permissions, active status)
// @route  PUT /api/users/:id
// @access Private (super_admin)
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const { name, phone, role, permissions, isActive, password } = req.body;

  // Guard against locking everyone out: don't allow demoting or deactivating the last
  // remaining active Super Admin account.
  const isDemotingRole = role !== undefined && role !== "super_admin";
  const isDeactivating = isActive === false;
  if (user.role === "super_admin" && (isDemotingRole || isDeactivating)) {
    const otherActiveSuperAdmins = await User.countDocuments({ role: "super_admin", isActive: true, _id: { $ne: user._id } });
    if (otherActiveSuperAdmins === 0) {
      res.status(400);
      throw new Error("Cannot demote or deactivate the last remaining active Super Admin");
    }
  }

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (role !== undefined) user.role = role;
  if (permissions !== undefined) user.permissions = permissions;
  if (isActive !== undefined) user.isActive = isActive;
  if (password) user.password = password; // triggers pre-save hash

  const updated = await user.save();
  res.json(updated);
});

// @desc   Delete a user
// @route  DELETE /api/users/:id
// @access Private (super_admin)
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Guard against locking everyone out: don't allow deleting the last remaining Super Admin.
  if (user.role === "super_admin") {
    const otherSuperAdmins = await User.countDocuments({ role: "super_admin", _id: { $ne: user._id } });
    if (otherSuperAdmins === 0) {
      res.status(400);
      throw new Error("Cannot delete the last remaining Super Admin account");
    }
  }

  await user.deleteOne();
  res.json({ message: "User deleted" });
});

module.exports = { createUser, getUsers, updateUser, deleteUser };
