<!-- 작성일시: 2026-10-28 15:40 -->
# PDF.js CMap 데이터 (vendor)

- 출처: npm `pdfjs-dist@6.4.299`의 `cmaps/` 폴더 전체(.bcmap 168개 + `LICENSE`). `npm pack pdfjs-dist@6.4.299`로 받은 tarball(sha256 `86269b40170eb41740ea05ad2102d71d33de4f122b34eb2f478be0ea7779c415`)에서 그대로 복사했습니다.
- 버전: `unpdf@1.9.1`이 묶은 PDF.js 6.4.299와 같은 버전입니다. unpdf를 올려 PDF.js 버전이 바뀌면 같은 버전의 `cmaps/`로 바꿉니다.
- 용도: 글꼴을 넣지 않고 미리 정의된 CJK CMap(UniKS-UCS2-H, KSCms-UHC-H 등)을 쓰는 PDF의 글자 추출. `src/pdf.js`의 `LocalBinaryDataFactory`가 이 폴더의 파일만 읽습니다(네트워크·네이티브 모듈 없음).
- 라이선스: CMap 데이터는 Adobe의 BSD 형식 라이선스(`LICENSE`), PDF.js는 Apache-2.0(`LICENSE-pdfjs`)입니다.
- 표준 글꼴 데이터(`standard_fonts/`)는 넣지 않았습니다. 텍스트 추출은 PDF.js 내장 글꼴 폭으로 충분하고 렌더링은 하지 않기 때문입니다.
