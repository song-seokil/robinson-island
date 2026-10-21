using UnityEngine;
using UnityEngine.InputSystem;

namespace Robinson.Graybox
{
    /// <summary>
    /// 회색박스 카메라. WASD/방향키 이동, 휠 줌, 우클릭 드래그 회전.
    /// Input System(new) 전용. 구 Input Manager를 쓰지 않는다.
    /// </summary>
    public sealed class GrayboxCamera : MonoBehaviour
    {
        public Vector3 Target = new Vector3(32f, 0f, 32f);
        public float Distance = 72f;
        public float Yaw = 45f;
        public float Pitch = 50f;
        public float PanSpeed = 28f;
        public float ZoomStep = 0.02f;
        public float OrbitSpeed = 0.2f;

        void LateUpdate()
        {
            HandlePan();
            HandleZoom();
            HandleOrbit();
            Apply();
        }

        void HandlePan()
        {
            var kb = Keyboard.current;
            if (kb == null) return;

            var move = Vector3.zero;
            if (kb.wKey.isPressed || kb.upArrowKey.isPressed) move.z += 1f;
            if (kb.sKey.isPressed || kb.downArrowKey.isPressed) move.z -= 1f;
            if (kb.aKey.isPressed || kb.leftArrowKey.isPressed) move.x -= 1f;
            if (kb.dKey.isPressed || kb.rightArrowKey.isPressed) move.x += 1f;

            if (move.sqrMagnitude <= 0f) return;

            var rot = Quaternion.Euler(0f, Yaw, 0f);
            Target += rot * move.normalized * (PanSpeed * Time.deltaTime);
        }

        void HandleZoom()
        {
            var mouse = Mouse.current;
            if (mouse == null) return;

            float scroll = mouse.scroll.ReadValue().y;
            if (Mathf.Abs(scroll) < 0.01f) return;

            Distance = Mathf.Clamp(Distance - scroll * ZoomStep, 16f, 170f);
        }

        void HandleOrbit()
        {
            var mouse = Mouse.current;
            if (mouse == null || !mouse.rightButton.isPressed) return;

            var delta = mouse.delta.ReadValue();
            Yaw += delta.x * OrbitSpeed;
            Pitch = Mathf.Clamp(Pitch - delta.y * OrbitSpeed, 22f, 86f);
        }

        void Apply()
        {
            var rot = Quaternion.Euler(Pitch, Yaw, 0f);
            transform.rotation = rot;
            transform.position = Target - rot * Vector3.forward * Distance;
        }
    }
}
