# 개발 환경 / 하드웨어 상태

> 마지막 확인: 2026-10-21

## 1. PC

| 항목 | 값 |
|---|---|
| OS | Windows 10 Home 22H2 (19045) |
| CPU | Intel Core i7-4710HQ 4C/8T |
| RAM | 16GB |
| GPU | NVIDIA GeForce GT 750M 2GB + Intel HD 4600 |
| C: | Samsung 256GB 내부 SSD |
| S: | `\\100.85.157.33\share` (Tailscale SMB, 여유 약 7.5TB) |
| D: | Generic External 128GB USB 외장 |

## 2. Unity / Android

- Unity Hub `3.22.3`
- Unity Editor `6000.3.26f1`
  - 실행 파일: `C:\Users\oocss\AppData\Local\Unity\Hub\Editor\6000.3.26f1\Editor\Unity.exe`
  - 리비전: `de8167e7440c`
- Unity Personal 라이선스 할당됨
- Android Build Support 설치됨
  - OpenJDK `17.0.18+8`
  - Android NDK `r27c`
  - CMake `3.22.1`
  - SDK build-tools `36.0.0`
  - platform-tools `37.0.1`
  - platforms `34/35/36/37.0`
  - command-line tools `16.0`

## 3. GPU 드라이버

- NVIDIA `425.31` 설치됨
- 보고된 드라이버 버전: `25.21.14.2531`
- GT 750M (Kepler 노트북)의 **마지막 공식 드라이버**.
- 최신 5xx/6xx 드라이버는 지원하지 않음. 추가 업데이트하지 말 것.

## 4. 저장소 정책

- **Unity 프로젝트/Library는 S:만 사용한다.**
  - 고정 경로: `S:\02. 송서방\01. 로빈슨 크루소\unity\RobinsonGraybox`
  - C:에 프로젝트나 Library를 만들지 않는다.
- C:는 Windows/앱 설치 전용. Unity Editor 설치와 전역 앱 캐시는 예외.
- D:는 **백업/보조 저장소 전용**. 중요한 데이터의 유일한 사본으로 쓰지 않는다.

## 5. D: 외장하드 검사 결과

USB 3.0 포트에 전원부를 연결한 뒤 재검사했다.

| 테스트 | 결과 |
|---|---|
| 1GB 연속 쓰기 | 36.1MB/s, 완료 |
| 1GB 읽기/SHA256 | 일치 |
| 4KB 파일 100개 | 100/100 통과 |
| 새 Disk Event 51 | 없음 |
| 새 NTFS Event 140 | 없음 |
| 현재 상태 | Healthy / Online |

이전에는 124MB 쓰기에서 끊기고 Event 51/140이 발생했다. 전원부를 USB 3.0에
연결한 뒤 1GB 테스트는 통과했지만, 장기 안정성이 증명된 것은 아니다.
D:는 백업용으로만 사용한다.

## 6. Android 테스트 상태

- Android 에뮬레이터/AVD는 아직 설치하지 않았다.
- Unity는 에뮬레이터를 공식 지원하지 않는다. 기능 스모크 테스트용으로만 쓴다.
- FPS/발열/배터리는 실제 Android 기기에서 측정해야 한다.

## 7. 알려진 제약

- S:는 SMB 네트워크 드라이브라 `fs.watch`가 동작하지 않는다.
  기존 Vite 설정은 `usePolling: true`를 유지해야 한다.
- Unity `Library`를 S:에 두면 초기 임포트와 재임포트가 로컬 SSD보다 느릴 수 있다.
  그래도 프로젝트/Library를 C:에 두지 않는다.
- 관리자 권한 없이 설치된 앱/도구가 일부 있다.
