"""
에셋용 텍스처 시트 + 아이콘 시트 생성 프롬프트 (image API 스텁)
프롬프트 상수를 여기서만 관리하고, 실제 호출은 image_api.generate() 로 대체 가능.
"""
TEXTURES = [
    ("rock", "seamless tileable rock surface texture, stylized game art, warm grey stone with subtle cracks and moss patches, soft ambient occlusion, top-down flat lighting, no shadows, high detail, 4k"),
    ("wood_bark", "seamless tileable bark texture, stylized game art, warm brown wood grain, slight vertical ridges, flat even lighting, no shadows, 4k"),
    ("leaf", "seamless tileable foliage texture, stylized game art, bright green leaves cluster, painterly soft edges, flat even lighting, no shadows, 4k"),
    ("sand", "seamless tileable sand texture, stylized game art, warm pale golden sand with fine speckles, flat even lighting, no shadows, 4k"),
    ("grass", "seamless tileable grass texture, stylized game art, vivid green blades with subtle yellow-green variation, painterly, flat even lighting, no shadows, 4k"),
    ("water", "seamless tileable water surface texture, stylized game art, bright turquoise lagoon water with gentle ripples, flat even lighting, 4k"),
]

# 게임 아이콘: 무텍스트 UI용 — 실루엣이 먼저 보이는 도형
ICONS = [
    ("icon_axe", "game UI icon, wooden axe with stone head, thick bold silhouette, flat bright colors, slight bevel, no text, centered, transparent background, mobile game style"),
    ("icon_hammer", "game UI icon, hammer with wooden handle, thick bold silhouette, flat bright colors, slight bevel, no text, centered, transparent background, mobile game style"),
    ("icon_chest", "game UI icon, wooden treasure chest with gold trim, thick bold silhouette, flat bright colors, no text, centered, transparent background, mobile game style"),
    ("icon_target", "game UI icon, round target with arrow, thick bold silhouette, flat bright colors, no text, centered, transparent background, mobile game style"),
    ("icon_pickaxe", "game UI icon, pickaxe mining tool, thick bold silhouette, flat bright colors, no text, centered, transparent background, mobile game style"),
    ("icon_sword", "game UI icon, crossed swords, thick bold silhouette, flat bright colors, no text, centered, transparent background, mobile game style"),
    ("icon_hammer_build", "game UI icon, construction hammer hitting a nail, thick bold silhouette, flat bright colors, no text, centered, transparent background, mobile game style"),
    ("icon_raft", "game UI icon, wooden raft with palm leaves, thick bold silhouette, flat bright colors, no text, centered, transparent background, mobile game style"),
    ("icon_campfire", "game UI icon, campfire with flame, thick bold silhouette, flat bright colors, no text, centered, transparent background, mobile game style"),
    ("icon_flag", "game UI icon, small victory flag, thick bold silhouette, flat bright colors, no text, centered, transparent background, mobile game style"),
    ("icon_pirate", "game UI icon, pirate skull head, thick bold silhouette, flat bright colors, no text, centered, transparent background, mobile game style"),
    ("icon_map", "game UI icon, folded treasure map, thick bold silhouette, flat bright colors, no text, centered, transparent background, mobile game style"),
]