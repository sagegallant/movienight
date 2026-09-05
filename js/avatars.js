// Avatars generator using DiceBear API (MIT licensed)
(function () {
  const collections = [
    "lorelei", // CC0 1.0 license
    "bottts", // Free for personal and commercial use
    "identicon", // MIT license
    "micah", // CC BY 4.0 license
  ];

  /**
   * Generate avatar options using DiceBear API
   * @param {string} collection - Optional specific collection to use
   */
  function generateAvatarOptions(collection = null) {
    // Find all avatar images
    const avatarImages = document.querySelectorAll("img.avatar-opt");

    avatarImages.forEach((img, index) => {
      // Get or set a seed for this avatar
      let seed = img.getAttribute("data-seed") || `avatar${index + 1}`;

      // Generate a new random seed if refreshing
      if (collection === "refresh") {
        seed = `avatar${index + 1}_${Math.random()
          .toString(36)
          .substring(2, 8)}`;
        img.setAttribute("data-seed", seed);
      }

      // Use specified collection or pick one based on index
      const useCollection =
        collection && collection !== "refresh"
          ? collection
          : collections[index % collections.length];

      // Generate the avatar URL using current DiceBear API format (v7.x)
      const avatarUrl = `https://api.dicebear.com/7.x/${useCollection}/svg?seed=${seed}`;

      // Set the image source
      img.src = avatarUrl;

      // Update data-avatar attribute to store the full URL
      img.setAttribute("data-avatar", avatarUrl);
    });
  }

  // Expose the function globally immediately
  window.generateAvatarOptions = generateAvatarOptions;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => generateAvatarOptions());
  } else {
    generateAvatarOptions();
  }
})();

