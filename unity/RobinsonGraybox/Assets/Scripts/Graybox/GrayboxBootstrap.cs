using UnityEngine;

namespace Robinson.Graybox
{
    /// <summary>
    /// M0 회색박스 부트스트랩.
    /// 씬에 아무 것도 없어도 Play를 누르면 월드를 만든다.
    /// M0-1 범위: 72×72 그리드, 플레이 영역 64×64 경계, HQ 큐브, 카메라, 시드 입력.
    /// (GRAYBOX_SPEC v0.16 기준: 전체 72×72, 인셋 4)
    /// </summary>
    public sealed class GrayboxBootstrap : MonoBehaviour
    {
        public const int MapSize = 72;
        public const int PlayableInset = 4;   // 72 - 4*2 = 64
        public const float TileSize = 1f;

        public int Seed = 1;

        string _seedText = "1";
        Transform _world;
        bool _rebuildRequested;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void AutoStart()
        {
            if (FindFirstObjectByType<GrayboxBootstrap>() != null) return;

            var go = new GameObject("~Graybox");
            go.AddComponent<GrayboxBootstrap>();
        }

        void Awake()
        {
            _seedText = Seed.ToString();
            Build();
        }

        void Update()
        {
            if (!_rebuildRequested) return;
            _rebuildRequested = false;
            Build();
        }

        void Build()
        {
            if (_world != null)
            {
                Destroy(_world.gameObject);
            }

            _world = new GameObject("World").transform;

            BuildGround();
            BuildGrid();
            BuildPlayableBorder();
            BuildHeadquarters();
            BuildLight();
            SetupCamera();
        }

        void BuildGround()
        {
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Ground";
            ground.transform.SetParent(_world, false);
            ground.transform.position = new Vector3(MapSize * 0.5f, 0f, MapSize * 0.5f);
            ground.transform.localScale = new Vector3(MapSize / 10f, 1f, MapSize / 10f);

            ApplyColor(ground, new Color(0.17f, 0.19f, 0.17f));
            Destroy(ground.GetComponent<Collider>());
        }

        void BuildGrid()
        {
            var go = new GameObject("Grid");
            go.transform.SetParent(_world, false);
            go.transform.position = new Vector3(0f, 0.01f, 0f);

            var grid = go.AddComponent<GridRenderer>();
            grid.Width = MapSize;
            grid.Height = MapSize;
            grid.TileSize = TileSize;
            grid.Build();
        }

        void BuildPlayableBorder()
        {
            float min = PlayableInset * TileSize;
            float max = (MapSize - PlayableInset) * TileSize;
            float len = max - min;

            var root = new GameObject("PlayableBorder").transform;
            root.SetParent(_world, false);

            CreateBar(root, new Vector3(min + len * 0.5f, 0.01f, min), new Vector3(len, 0.02f, 0.08f));
            CreateBar(root, new Vector3(min + len * 0.5f, 0.01f, max), new Vector3(len, 0.02f, 0.08f));
            CreateBar(root, new Vector3(min, 0.01f, min + len * 0.5f), new Vector3(0.08f, 0.02f, len));
            CreateBar(root, new Vector3(max, 0.01f, min + len * 0.5f), new Vector3(0.08f, 0.02f, len));
        }

        void CreateBar(Transform parent, Vector3 position, Vector3 scale)
        {
            var bar = GameObject.CreatePrimitive(PrimitiveType.Cube);
            bar.name = "Border";
            bar.transform.SetParent(parent, false);
            bar.transform.position = position;
            bar.transform.localScale = scale;

            ApplyColor(bar, new Color(0.85f, 0.87f, 0.90f));
            Destroy(bar.GetComponent<Collider>());
        }

        void BuildHeadquarters()
        {
            var hq = GameObject.CreatePrimitive(PrimitiveType.Cube);
            hq.name = "HQ";
            hq.transform.SetParent(_world, false);
            hq.transform.position = new Vector3(MapSize * 0.5f, 0.5f, MapSize * 0.5f);
            hq.transform.localScale = new Vector3(2f, 1f, 2f);

            ApplyColor(hq, new Color(0.84f, 0.74f, 0.45f));
        }

        void BuildLight()
        {
            // 씬(SampleScene)에 이미 Directional Light가 있고 RenderSettings.sun으로 등록되어 있다.
            // 그 경우 하나 더 만들면 조명이 두 겹이 되어 밝기와 FPS 측정이 오염되므로 건너뛴다.
            // 빈 씬에서 실행될 때만 여기서 조명을 만든다.
            var sun = RenderSettings.sun;
            if (sun != null && sun.type == LightType.Directional) return;

            var go = new GameObject("Directional Light");
            go.transform.SetParent(_world, false);
            go.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

            var light = go.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.1f;
            light.shadows = LightShadows.Soft;
        }

        void SetupCamera()
        {
            var cam = Camera.main;
            if (cam == null)
            {
                var go = new GameObject("Main Camera") { tag = "MainCamera" };
                cam = go.AddComponent<Camera>();
                go.AddComponent<AudioListener>();
            }

            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.08f, 0.09f, 0.11f);
            cam.fieldOfView = 45f;

            var controller = cam.GetComponent<GrayboxCamera>();
            if (controller == null)
            {
                controller = cam.gameObject.AddComponent<GrayboxCamera>();
            }
            controller.Target = new Vector3(MapSize * 0.5f, 0f, MapSize * 0.5f);
        }

        static void ApplyColor(GameObject go, Color color)
        {
            var renderer = go.GetComponent<Renderer>();
            if (renderer == null) return;

            // 빌드에서 셰이더가 제외되면 Shader.Find가 null을 돌려준다.
            // Standard/Unlit/Color는 GraphicsSettings의 Always Included Shaders에 등록해 두었지만,
            // 그래도 null이면 프리미티브의 기본 머티리얼을 복제해 색만 바꾼다.
            var shader = Shader.Find("Standard");
            if (shader == null) shader = Shader.Find("Unlit/Color");

            if (shader != null)
            {
                renderer.sharedMaterial = new Material(shader) { color = color };
            }
            else
            {
                renderer.material.color = color;
            }
        }

        void OnGUI()
        {
            GUILayout.BeginArea(new Rect(12f, 12f, 300f, 150f), GUI.skin.box);
            GUILayout.Label("Robinson Graybox — M0");
            GUILayout.Space(4f);

            GUILayout.BeginHorizontal();
            GUILayout.Label("Seed", GUILayout.Width(38f));
            _seedText = GUILayout.TextField(_seedText, GUILayout.Width(90f));
            if (GUILayout.Button("적용"))
            {
                if (int.TryParse(_seedText, out int parsed))
                {
                    Seed = parsed;
                    _rebuildRequested = true;
                }
            }
            GUILayout.EndHorizontal();

            GUILayout.Space(4f);
            float fps = Time.smoothDeltaTime > 0f ? 1f / Time.smoothDeltaTime : 0f;
            int playable = MapSize - PlayableInset * 2;
            GUILayout.Label($"{MapSize}×{MapSize} / playable {playable}×{playable} / FPS {fps:0}");
            GUILayout.Label("WASD 이동 · 우클릭 회전 · 휠 줌");
            GUILayout.EndArea();
        }
    }
}
