using System.Collections.Generic;
using UnityEngine;

namespace Robinson.Graybox
{
    /// <summary>
    /// 타일 그리드를 선 메시로 그린다. 타일 1칸 = 1 유닛. 크기는 Width/Height로 받는다
    /// (GrayboxBootstrap이 72×72로 설정한다).
    /// 회색박스 전용이며 최종 아트가 아니다.
    /// </summary>
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
    public sealed class GridRenderer : MonoBehaviour
    {
        public int Width = 72;
        public int Height = 72;
        public float TileSize = 1f;
        public Color LineColor = new Color(0.32f, 0.35f, 0.38f, 1f);

        Mesh _mesh;

        void Start()
        {
            // AddComponent 직후 호출자가 Width/Height를 넣고 Build()를 직접 부르는 경우가 있다.
            // Awake에서 기본값으로 먼저 빌드하면 같은 프레임에 두 번 빌드하게 되므로,
            // Start 시점에 아직 메시가 없을 때만 빌드한다.
            if (_mesh == null) Build();
        }

        public void Build()
        {
            float w = Width * TileSize;
            float h = Height * TileSize;

            var verts = new List<Vector3>((Width + Height + 2) * 2);
            var indices = new List<int>((Width + Height + 2) * 2);

            for (int x = 0; x <= Width; x++)
            {
                float px = x * TileSize;
                AddLine(verts, indices, new Vector3(px, 0f, 0f), new Vector3(px, 0f, h));
            }

            for (int z = 0; z <= Height; z++)
            {
                float pz = z * TileSize;
                AddLine(verts, indices, new Vector3(0f, 0f, pz), new Vector3(w, 0f, pz));
            }

            if (_mesh != null)
            {
                Destroy(_mesh);
            }

            _mesh = new Mesh { name = "GrayboxGrid" };
            _mesh.SetVertices(verts);
            _mesh.SetIndices(indices, MeshTopology.Lines, 0);
            _mesh.RecalculateBounds();

            GetComponent<MeshFilter>().sharedMesh = _mesh;

            var shader = Shader.Find("Unlit/Color");
            if (shader == null) shader = Shader.Find("Sprites/Default");

            var renderer = GetComponent<MeshRenderer>();
            if (shader != null)
            {
                renderer.sharedMaterial = new Material(shader) { color = LineColor };
            }
            else if (renderer.sharedMaterial != null)
            {
                renderer.material.color = LineColor;
            }
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
        }

        static void AddLine(List<Vector3> verts, List<int> indices, Vector3 a, Vector3 b)
        {
            indices.Add(verts.Count);
            verts.Add(a);
            indices.Add(verts.Count);
            verts.Add(b);
        }

        void OnDestroy()
        {
            if (_mesh != null) Destroy(_mesh);
        }
    }
}
