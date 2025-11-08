const { MarketItem, LookingForPost, PublicUser } = require("../models");
const { Op, Sequelize } = require("sequelize");
const { computeAgeFromBirthYear } = require("../utils/userProfile");

/**
 * Data Service - Direct access to models for ML service
 * This allows the ML service to fetch data directly without HTTP calls
 */
class DataService {
  /**
   * Get marketplace items with filters
   * @param {Object} filters - { tag, searchTerm, priceRange, limit, featured }
   * @returns {Promise<Array>}
   */
  async getMarketItems(filters = {}) {
    try {
      const {
        tag,
        searchTerm,
        priceRange,
        limit = 10,
        featured = false,
        dateRange,
      } = filters;

      const where = {};

      // Filter by tag
      if (tag) {
        const normalizedTag = this.normalizeTag(tag);
        if (normalizedTag) {
          where.tag = normalizedTag;
        }
      }

      // Filter by featured
      if (featured) {
        where.is_featured = true;
      }

      // Search by title or description
      if (searchTerm) {
        where[Op.or] = [
          { title: { [Op.iLike]: `%${searchTerm}%` } },
          { description: { [Op.iLike]: `%${searchTerm}%` } },
        ];
      }

      // Filter by price range
      if (priceRange) {
        if (priceRange.min !== undefined) {
          where.price = { ...where.price, [Op.gte]: priceRange.min };
        }
        if (priceRange.max !== undefined) {
          where.price = { ...where.price, [Op.lte]: priceRange.max };
        }
      }

      // Filter by date range
      if (dateRange) {
        const now = new Date();
        let startDate;
        if (dateRange === "today") {
          startDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          );
        } else if (dateRange === "week") {
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
        } else if (dateRange === "month") {
          startDate = new Date(now);
          startDate.setMonth(now.getMonth() - 1);
        }
        if (startDate) {
          where.createdAt = { [Op.gte]: startDate };
        }
      }

      const items = await MarketItem.findAll({
        where,
        order: [
          ["is_featured", "DESC"],
          [
            Sequelize.literal(
              "CASE WHEN tag='hot_deals' THEN 0 WHEN tag='weekend_picks' THEN 1 ELSE 2 END"
            ),
            "ASC",
          ],
          ["createdAt", "DESC"],
        ],
        limit: parseInt(limit),
        raw: true,
      });

      return items.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        price: item.price,
        images: item.images,
        tag: item.tag,
        tag_label:
          item.tag === "hot_deals"
            ? "Hot Deals"
            : item.tag === "weekend_picks"
            ? "Weekend Picks"
            : null,
        is_featured: item.is_featured,
        created_at: item.createdAt,
      }));
    } catch (error) {
      console.error("Error fetching market items:", error);
      return [];
    }
  }

  /**
   * Get marketplace statistics
   * @returns {Promise<Object>}
   */
  async getMarketStats() {
    try {
      const totalItems = await MarketItem.count();
      const featuredItems = await MarketItem.count({
        where: { is_featured: true },
      });
      const hotDealsCount = await MarketItem.count({
        where: { tag: "hot_deals" },
      });
      const weekendPicksCount = await MarketItem.count({
        where: { tag: "weekend_picks" },
      });

      const avgPriceResult = await MarketItem.findAll({
        attributes: [[Sequelize.fn("AVG", Sequelize.col("price")), "avgPrice"]],
        raw: true,
      });
      const averagePrice = parseFloat(avgPriceResult[0]?.avgPrice || 0);

      return {
        totalItems,
        featuredItems,
        hotDealsCount,
        weekendPicksCount,
        averagePrice: averagePrice.toFixed(2),
      };
    } catch (error) {
      console.error("Error fetching market stats:", error);
      return {
        totalItems: 0,
        featuredItems: 0,
        hotDealsCount: 0,
        weekendPicksCount: 0,
        averagePrice: "0.00",
      };
    }
  }

  /**
   * Get posts (Looking For posts) with filters
   * @param {Object} filters - { searchTerm, dateRange, limit }
   * @returns {Promise<Array>}
   */
  async getPosts(filters = {}) {
    try {
      const { searchTerm, dateRange, limit = 10 } = filters;

      const where = {};

      // Search by content (LookingForPost uses 'content' field, not 'title')
      if (searchTerm) {
        where.content = { [Op.iLike]: `%${searchTerm}%` };
      }

      // Filter by date range
      if (dateRange) {
        const now = new Date();
        let startDate;
        if (dateRange === "today") {
          startDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          );
        } else if (dateRange === "week") {
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
        } else if (dateRange === "month") {
          startDate = new Date(now);
          startDate.setMonth(now.getMonth() - 1);
        }
        if (startDate) {
          where.createdAt = { [Op.gte]: startDate };
        }
      }

      const posts = await LookingForPost.findAll({
        where,
        include: [
          {
            model: PublicUser,
            as: "author",
            attributes: ["id", "name", "photo", "category"],
          },
        ],
        order: [["createdAt", "DESC"]],
        limit: parseInt(limit),
      });

      return posts.map((post) => ({
        id: post.id,
        title: post.content
          ? post.content.substring(0, 50) + "..."
          : "Looking For",
        content: post.content,
        author: post.author
          ? {
              id: post.author.id,
              name: post.author.name,
              photo: post.author.photo,
              category: post.author.category,
            }
          : null,
        created_at: post.createdAt,
      }));
    } catch (error) {
      console.error("Error fetching posts:", error);
      return [];
    }
  }

  /**
   * Get posts statistics
   * @returns {Promise<Object>}
   */
  async getPostsStats() {
    try {
      const totalPosts = await LookingForPost.count();

      return {
        totalPosts,
      };
    } catch (error) {
      console.error("Error fetching posts stats:", error);
      return {
        totalPosts: 0,
      };
    }
  }

  /**
   * Get users with filters
   * @param {Object} filters - { category, gender, ageRange, searchTerm, limit }
   * @returns {Promise<Array>}
   */
  async getUsers(filters = {}) {
    try {
      const {
        category,
        gender,
        ageRange,
        searchTerm,
        limit = 10,
        verified = false,
      } = filters;

      const where = {};

      // Filter by category
      if (category) {
        where.category = category;
      }

      // Filter by gender
      if (gender) {
        where.gender = gender;
      }

      // Filter by age range
      if (ageRange) {
        const currentYear = new Date().getFullYear();
        if (ageRange.min !== undefined) {
          const maxBirthYear = currentYear - parseInt(ageRange.min, 10);
          if (!Number.isNaN(maxBirthYear)) {
            where.birth_year = {
              ...(where.birth_year || {}),
              [Op.lte]: maxBirthYear,
            };
          }
        }
        if (ageRange.max !== undefined) {
          const minBirthYear = currentYear - parseInt(ageRange.max, 10);
          if (!Number.isNaN(minBirthYear)) {
            where.birth_year = {
              ...(where.birth_year || {}),
              [Op.gte]: minBirthYear,
            };
          }
        }
      }

      // Filter by verified status
      if (verified) {
        where.isVerified = true;
      }

      // Search by name
      if (searchTerm) {
        where.name = { [Op.iLike]: `%${searchTerm}%` };
      }

      const users = await PublicUser.findAll({
        where,
        attributes: [
          "id",
          "name",
          "photo",
          "category",
          "gender",
          "age",
          "birth_year",
          "bio",
          "isVerified",
          "createdAt",
        ],
        order: [["createdAt", "DESC"]],
        limit: parseInt(limit),
        raw: true,
      });

      return users.map((user) => ({
        id: user.id,
        name: user.name,
        photo: user.photo,
        category: user.category,
        gender: user.gender,
        age: computeAgeFromBirthYear(user.birth_year) ?? user.age ?? null,
        birth_year: user.birth_year ?? null,
        bio: user.bio,
        isVerified: user.isVerified,
        created_at: user.createdAt,
      }));
    } catch (error) {
      console.error("Error fetching users:", error);
      return [];
    }
  }

  /**
   * Get users statistics
   * @returns {Promise<Object>}
   */
  async getUsersStats() {
    try {
      const totalUsers = await PublicUser.count();
      const verifiedUsers = await PublicUser.count({
        where: { isVerified: true },
      });

      const categoryCounts = await PublicUser.findAll({
        attributes: [
          "category",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
        ],
        group: ["category"],
        raw: true,
      });

      const categoryStats = {};
      categoryCounts.forEach((item) => {
        categoryStats[item.category] = parseInt(item.count);
      });

      return {
        totalUsers,
        verifiedUsers,
        categoryStats,
      };
    } catch (error) {
      console.error("Error fetching users stats:", error);
      return {
        totalUsers: 0,
        verifiedUsers: 0,
        categoryStats: {},
      };
    }
  }

  /**
   * Search across all data types
   * @param {string} searchTerm
   * @param {Object} options - { types: ['market', 'posts', 'users'], limit }
   * @returns {Promise<Object>}
   */
  async searchAll(searchTerm, options = {}) {
    try {
      const { types = ["market", "posts", "users"], limit = 5 } = options;

      const results = {};

      if (types.includes("market")) {
        results.market = await this.getMarketItems({
          searchTerm,
          limit,
        });
      }

      if (types.includes("posts")) {
        results.posts = await this.getPosts({
          searchTerm,
          limit,
        });
      }

      if (types.includes("users")) {
        results.users = await this.getUsers({
          searchTerm,
          limit,
        });
      }

      return results;
    } catch (error) {
      console.error("Error searching all:", error);
      return {};
    }
  }

  /**
   * Normalize tag value
   * @param {string} tag
   * @returns {string|null}
   */
  normalizeTag(tag) {
    if (!tag) return null;
    const normalized = String(tag).toLowerCase().replace(/[-\s]/g, "_");
    if (
      normalized === "hot_deals" ||
      normalized === "hot" ||
      normalized === "hotdeal" ||
      normalized === "hot_deal"
    ) {
      return "hot_deals";
    }
    if (
      normalized === "weekend_picks" ||
      normalized === "weekend" ||
      normalized === "weekendpick" ||
      normalized === "weekend_pick"
    ) {
      return "weekend_picks";
    }
    if (normalized === "none") return "none";
    return null;
  }
}

module.exports = new DataService();
