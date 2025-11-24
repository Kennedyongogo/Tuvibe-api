const { StoryMusic, Story } = require("../models");
const { Op } = require("sequelize");

// Get all available music tracks (public endpoint for users)
exports.getAvailableMusic = async (req, res) => {
  try {
    const musicTracks = await StoryMusic.findAll({
      where: {
        is_active: true,
      },
      order: [["order", "ASC"], ["createdAt", "DESC"]],
      attributes: {
        exclude: ["createdAt", "updatedAt"],
      },
    });

    return res.status(200).json({
      success: true,
      data: musicTracks,
      count: musicTracks.length,
    });
  } catch (error) {
    console.error("Error fetching available music:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching music tracks",
      error: error.message,
    });
  }
};

// Admin: Get all music tracks (including inactive)
exports.getAllMusic = async (req, res) => {
  try {
    const musicTracks = await StoryMusic.findAll({
      order: [["order", "ASC"], ["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      data: musicTracks,
      count: musicTracks.length,
    });
  } catch (error) {
    console.error("Error fetching all music:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching music tracks",
      error: error.message,
    });
  }
};

// Admin: Get single music track
exports.getMusicById = async (req, res) => {
  try {
    const { id } = req.params;

    const music = await StoryMusic.findByPk(id);
    if (!music) {
      return res.status(404).json({
        success: false,
        message: "Music track not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: music,
    });
  } catch (error) {
    console.error("Error fetching music:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching music track",
      error: error.message,
    });
  }
};

// Admin: Create new music track
exports.createMusic = async (req, res) => {
  try {
    const { title, artist, duration, order } = req.body;

    // Validate required fields
    if (!title || !artist) {
      return res.status(400).json({
        success: false,
        message: "Title and artist are required",
      });
    }

    // Check if audio file is uploaded or URL is provided
    const audioFile = req.files?.audio_file?.[0];
    const coverFile = req.files?.cover_image?.[0];
    const audioUrl = req.body.audio_url;
    const coverImageUrl = req.body.cover_image_url;

    if (!audioFile && !audioUrl) {
      return res.status(400).json({
        success: false,
        message: "Please provide either an audio file upload or audio_url",
      });
    }

    // Determine audio URL - use uploaded file path or provided URL
    let finalAudioUrl;
    if (audioFile) {
      finalAudioUrl = `music/audio/${audioFile.filename}`;
    } else {
      finalAudioUrl = audioUrl;
    }

    // Determine cover image URL - use uploaded file path or provided URL
    let finalCoverImageUrl = null;
    if (coverFile) {
      finalCoverImageUrl = `music/covers/${coverFile.filename}`;
    } else if (coverImageUrl) {
      finalCoverImageUrl = coverImageUrl;
    }

    // Check if we already have 10 active tracks (limit)
    const activeCount = await StoryMusic.count({
      where: { is_active: true },
    });

    if (activeCount >= 10) {
      return res.status(400).json({
        success: false,
        message:
          "Maximum of 10 active music tracks allowed. Please deactivate an existing track first.",
      });
    }

    const music = await StoryMusic.create({
      title,
      artist,
      audio_url: finalAudioUrl,
      cover_image_url: finalCoverImageUrl,
      duration: duration ? parseInt(duration) : null,
      order: order ? parseInt(order) : activeCount,
      is_active: true,
    });

    return res.status(201).json({
      success: true,
      message: "Music track created successfully",
      data: music,
    });
  } catch (error) {
    console.error("Error creating music:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating music track",
      error: error.message,
    });
  }
};

// Admin: Update music track
exports.updateMusic = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, artist, audio_url, cover_image_url, duration, order, is_active } =
      req.body;

    const music = await StoryMusic.findByPk(id);
    if (!music) {
      return res.status(404).json({
        success: false,
        message: "Music track not found",
      });
    }

    // If activating, check if we already have 10 active tracks
    if (is_active === true && !music.is_active) {
      const activeCount = await StoryMusic.count({
        where: {
          is_active: true,
          id: { [Op.ne]: id },
        },
      });

      if (activeCount >= 10) {
        return res.status(400).json({
          success: false,
          message:
            "Maximum of 10 active music tracks allowed. Please deactivate another track first.",
        });
      }
    }

    // Handle file uploads
    const audioFile = req.files?.audio_file?.[0];
    const coverFile = req.files?.cover_image?.[0];

    // Update fields
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (artist !== undefined) updateData.artist = artist;
    
    // Handle audio URL - prioritize uploaded file over provided URL
    if (audioFile) {
      updateData.audio_url = `music/audio/${audioFile.filename}`;
    } else if (audio_url !== undefined) {
      updateData.audio_url = audio_url;
    }
    
    // Handle cover image URL - prioritize uploaded file over provided URL
    if (coverFile) {
      updateData.cover_image_url = `music/covers/${coverFile.filename}`;
    } else if (cover_image_url !== undefined) {
      updateData.cover_image_url = cover_image_url;
    }
    
    if (duration !== undefined) updateData.duration = duration ? parseInt(duration) : null;
    if (order !== undefined) updateData.order = order ? parseInt(order) : music.order;
    if (is_active !== undefined) updateData.is_active = is_active;

    await music.update(updateData);

    return res.status(200).json({
      success: true,
      message: "Music track updated successfully",
      data: music,
    });
  } catch (error) {
    console.error("Error updating music:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating music track",
      error: error.message,
    });
  }
};

// Admin: Delete music track
exports.deleteMusic = async (req, res) => {
  try {
    const { id } = req.params;

    const music = await StoryMusic.findByPk(id);
    if (!music) {
      return res.status(404).json({
        success: false,
        message: "Music track not found",
      });
    }

    // Check if any stories are using this music
    const storiesUsingMusic = await Story.count({
      where: { music_id: id },
    });

    if (storiesUsingMusic > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete music track. It is currently being used by ${storiesUsingMusic} story/stories. Please remove it from stories first or wait for stories to expire.`,
      });
    }

    await music.destroy();

    return res.status(200).json({
      success: true,
      message: "Music track deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting music:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting music track",
      error: error.message,
    });
  }
};


