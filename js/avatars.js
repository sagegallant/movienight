// Avatars generator using DiceBear API (MIT licensed)
(function () {
  const collections = [
    "lorelei",
    "bottts",
    "micah",
    "avataaars",
    "adventurer",
    "big-ears",
    "thumbs",
  ];

  /**
   * Generate avatar options using DiceBear API
   * @param {string} collection - Optional specific collection or "refresh"
   */
  function generateAvatarOptions(collection = null) {
    const avatarImages = document.querySelectorAll("img.avatar-opt");

    avatarImages.forEach((img, index) => {
      // Always generate a fresh random seed for true randomization
      const randomSeed = Math.random().toString(36).substring(2, 10);
      const seed = `avatar_${index + 1}_${randomSeed}`;
      img.setAttribute("data-seed", seed);

      // Pick a random collection per avatar slot unless explicitly specified
      const chosenCollection =
        collection && collection !== "refresh"
          ? collection
          : collections[Math.floor(Math.random() * collections.length)];

      // Generate the avatar URL using DiceBear API v7.x
      const avatarUrl = `https://api.dicebear.com/7.x/${chosenCollection}/svg?seed=${seed}`;

      img.src = avatarUrl;
      img.setAttribute("data-avatar", avatarUrl);
    });
  }

  window.generateAvatarOptions = generateAvatarOptions;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => generateAvatarOptions());
  } else {
    generateAvatarOptions();
  }
})();


