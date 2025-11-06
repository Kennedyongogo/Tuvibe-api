const { Favourite, PublicUser } = require("../models");

exports.list = async (req, res) => {
  try {
    const rows = await Favourite.findAll({
      where: { public_user_id: req.publicUserId },
      include: [
        {
          model: PublicUser,
          as: "favouritedUser",
          attributes: [
            "id",
            "name",
            "photo",
            "category",
            "age",
            "gender",
            "bio",
            "county",
            "isVerified",
            "is_online",
            "last_seen_at",
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("favourites list error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to list favourites" });
  }
};

exports.add = async (req, res) => {
  try {
    const { favourite_user_id } = req.body;
    if (!favourite_user_id)
      return res
        .status(400)
        .json({ success: false, message: "favourite_user_id required" });
    if (favourite_user_id === req.publicUserId)
      return res
        .status(400)
        .json({ success: false, message: "Cannot favourite yourself" });
    const target = await PublicUser.findByPk(favourite_user_id);
    if (!target)
      return res
        .status(404)
        .json({ success: false, message: "Target user not found" });
    const exists = await Favourite.findOne({
      where: { public_user_id: req.publicUserId, favourite_user_id },
    });
    if (exists)
      return res
        .status(409)
        .json({ success: false, message: "Already favourited" });
    const row = await Favourite.create({
      public_user_id: req.publicUserId,
      favourite_user_id,
    });

    // Return with user details
    const favouriteWithUser = await Favourite.findByPk(row.id, {
      include: [
        {
          model: PublicUser,
          as: "favouritedUser",
          attributes: [
            "id",
            "name",
            "photo",
            "category",
            "age",
            "gender",
            "bio",
            "county",
            "isVerified",
            "is_online",
            "last_seen_at",
          ],
        },
      ],
    });

    return res.status(201).json({ success: true, data: favouriteWithUser });
  } catch (err) {
    console.error("favourites add error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to add favourite" });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await Favourite.findByPk(id);
    if (!row || row.public_user_id !== req.publicUserId)
      return res
        .status(404)
        .json({ success: false, message: "Favourite not found" });
    await row.destroy();
    return res.json({ success: true });
  } catch (err) {
    console.error("favourites remove error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to remove favourite" });
  }
};
