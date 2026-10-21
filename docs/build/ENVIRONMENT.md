# 개발 환경 / 하드웨어 상태

> 마지막 확인: 2026-10-21

## 1. 기기 (2대)

| 항목 | 집 (HOME) | 사무실 (OFFICE) |
|---|---|---|
| Tailscale 노드 | `desktop-4j2efo2` (100.103.70.38) | `ub-d40-230204` (100.109.162.75) |
| Windows 사용자 | `oocss` | `UBIVELOX` |
| 기종 | 미확인 | LG Gram `15ZD90Q-GX56K` |
| OS | Windows 10 Home 22H2 (19045) | Windows 11 Enterprise (26200) |
| CPU | i7-4710HQ 4C/8T | i5-1240P 12C/16T |
| RAM | 16GB | 15.7GB |
| GPU | GT 750M 2GB + HD 4600 | **Iris Xe (내장, dGPU 없음)** |
| Unity `6000.3.26f1` | 설치됨 | **미설치** |
| C: | Samsung 256GB SSD | 미확인 |

- S:는 두 기기 모두 Tailscale 너머 NAS(`ds220j`, `100.85.157.33`)의 공유다. (여유 약 7.5TB)
- HOME의 D:는 Generic External 128GB USB 외장 — 백업 전용.
- 사무실 기기는 dGPU가 없지만 **Iris Xe가 GT 750M보다 빠르고 CPU도 3배 이상**이다. 회색박스(빌트인 파이프라인, 큐브)에는 사무실 기기가 유리하다.
- 단 **사무실 기기에는 Unity가 없어서** 설치 전까지 Play 검증이 불가능하다.

## 2. Unity / Android (HOME 기준)

> OFFICE에는 Unity Hub/Editor가 설치되어 있지 않다. 아래 경로는 HOME 전용이다.

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

## 3. GPU 드라이버 (HOME)

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
