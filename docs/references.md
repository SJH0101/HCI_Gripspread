# 참고 문헌

GripSpread 기획, 실험 설계, 파일럿 절차에서 근거로 쓴 자료. 어디에 썼는지 같이 적어둔다.

## 문제 정의, 선행연구

- **Ng, A., Brewster, S. A., & Williamson, J. H. (2014).** Investigating the effects of encumbrance on one- and two-handed interactions with mobile devices. *Proc. CHI 2014*, 1981–1990. https://doi.org/10.1145/2556288.2557312
  - 쓴 곳: 물건을 든 채로는 입력 정확도가 떨어진다는 근거 (발표 대본 2번, 선행연구 표 1번 줄).
- **Ng, A., Brewster, S. A., & Williamson, J. (2013).** The impact of encumbrance on mobile interactions. *INTERACT 2013*, LNCS 8119, 92–109. https://doi.org/10.1007/978-3-642-40477-1_6
  - 쓴 곳: 같은 저자의 앞선 연구. 물건을 들고 걷는 상황의 입력 저하.
- **Sharma, A., Salchow-Hömmen, C., Mollyn, V. S., Nittala, A. S., Hedderich, M. A., Koelle, M., Seel, T., & Steimle, J. (2022).** SparseIMU: Computational design of sparse IMU layouts for sensing fine-grained finger microgestures. *ACM TOCHI*. https://doi.org/10.1145/3569894
  - 쓴 곳: 가장 가까운 선행연구. 물건을 쥔 채 손가락 벌리기가 있지만 IMU를 손에 달고, 한 손가락(약지 기준) 벌림을 이산 분류만 함. 연속 스크롤 아님.

## 스크롤 과제와 측정

- **Hinckley, K., Cutrell, E., Bathiche, S., & Muss, T. (2002).** Quantitative analysis of scrolling techniques. *Proc. CHI 2002*, 65–72. https://www.microsoft.com/en-us/research/publication/quantitative-analysis-of-scrolling-techniques/
  - 쓴 곳: 스크롤을 Fitts 과제로 평가하는 방식, 줄 번호로 목표를 알려주는 방식.
- **Chen, C., Myers, B. A., Ergin, C., Porat, E., Li, S., & Wang, C. (2022).** ScrollTest: Evaluating scrolling speed and accuracy. arXiv:2210.00735. https://arxiv.org/abs/2210.00735
  - 쓴 곳: known 조건(번호 줄로 이동 지시), 멈춤 판정(목표가 네모 안에 완전히 들어온 채 66ms 동안 스크롤 이벤트 없음). 실험 프로그램 `stopMs = 66`.

## 속도 조작 방식 (rate control)

- **Moscovich, T., & Hughes, J. F. (2004).** Navigating documents with the virtual scroll ring. *Proc. UIST 2004*. https://www.moscovich.net/papers/scrollring04.pdf
  - 쓴 곳 (2026-11-09 목표 줄 표시): Hinckley et al. (2002)의 왕복 과제를 그대로 따랐다고 밝히며, "두 개의 표시된 줄(marked lines)을 번갈아 표시된 세로 틀 안에" 넣게 함. 목표 줄을 색으로 표시한 근거. 틀 안 피드백은 없고, 틀 밖에서 확정하면 벨.
- **Lavenant, S., Goguey, A., Malacria, S., Nigay, L., & Pietrzak, T. (2026).** Investigating single-handed microgesture scrolling techniques. *Proc. CHI 2026*. https://doi.org/10.1145/3772318.3791215
  - 쓴 곳: 가장 최근의 가까운 선행연구. 한 손 미세 제스처(Tap, Hold, Drag)로 1D 스크롤, 위치/속도 조작 4기법, 24명. Drag + 속도 조작이 가장 효과적. 물건을 든 상황은 다루지 않음(우리와의 차이). 목표 제시는 0–999 번호 목록 + 오른쪽에 목표 번호(목표 줄 색 표시 없음), 가운데 고정 커서가 가리키는 줄을 회색 표시, 500 ms 머물면 선택(머무는 동안 배경색이 차오르는 피드포워드). 변환 함수 상수는 외부 참가자 4명과 시행착오로 정함. 우리는 목표 줄 표시 쪽(Hinckley 방식)을 골랐고, 번호만 쓰는 방식은 ScrollTest와 이 논문.
- **Zhai, S. (1998).** User performance in relation to 3D input device design. *Computer Graphics*, 32(4), 50–54. https://www.dgp.toronto.edu/public_user/BillBuxton/SIGGRAPHQ/shumin
  - 쓴 곳: 속도 조작은 놓으면 제자리로 돌아오는(self-centering) 입력에서 잘 맞는다는 근거와 그 한계. 편한 V를 중립으로 두고 멈춤 구간을 둔 이유.
- **Lee, B., Nancel, M., & Oulasvirta, A. (2017).** AutoGain: Gain function adaptation with submovement efficiency optimization. *Proc. CHI 2017*. https://arxiv.org/abs/1611.08154
  - 쓴 곳: 게인 함수는 보통 연구자의 시행착오로 정해지고, 최적값이 사람마다 다르다는 근거. 연구자끼리만 정하면 안 되는 이유.

## 파일럿으로 값 정하기, 사람별 보정

- **Fashimpaur, J., Karlson, A., Jonker, T. R., Benko, H., & Gupta, A. (2023).** Investigating wrist deflection scrolling techniques for extended reality. *Proc. CHI 2023*. https://research.facebook.com/file/763903402014643/Investigating_Wrist_Deflection_Scrolling_Techniques_for_Extended_Reality.pdf
  - 쓴 곳 (시행 시작 클러치, 원문 3.1절·4.4절 확인): 손목 조이스틱은 집기로 켜고 떼서 끄는 클러치를 둔다. "선택하려고 집을 때 의도치 않은 스크롤을 막으려고" 맨손 기법에만 집기 시작 → 목록 움직임 사이 0.15초 지연을 넣었다(컨트롤러 조이스틱에는 없음). 선택은 두 번 집기 클릭. 우리는 집기를 쓸 수 없어 "편한 V에 150ms 머물기"를 클러치로 쓰고 GripSpread에만 건다.
  - 쓴 곳: 우리 파일럿 절차의 기준. 연구자 반복 → 파일럿 1(5명, 방향 고르기) → 파일럿 2(4명, 상수를 하나씩 바꿔 나은지 묻고 사람별 최적값을 평균해 고정) → 본 실험 24명 고정값. 사람별로는 편한 가동 범위와 중립 각도만 보정하고, 조건이나 자세가 바뀌면 다시 보정. 속도 0 구간(neutral zone)이 정밀 조작을 돕고, 시작 위치 기준의 중립은 사람들이 잊어버려서 고정 중립을 씀.

## 참가자 수

- **Caine, K. (2016).** Local standards for sample size at CHI. *Proc. CHI 2016*, 981–992. https://doi.org/10.1145/2858036.2858498
  - 쓴 곳: CHI 2014 논문에서 가장 흔한 표본 크기 12명(10%), 중앙값 18명, 피험자 내 실험 평균 17명. 목표 20명(최소 16명)의 근거.
- **Martin, D. W. (2004).** *Doing psychology experiments* (6th ed.). Wadsworth.
  - 쓴 곳: "비슷한 연구가 쓴 인원수를 따른다" (수업 자료 Quantitative Evaluation 1에서 인용).

## 손 크기 측정

- **ISO 7250-1:2017.** Basic human body measurements for technological design — Part 1: Body measurement definitions and landmarks. 4.3.1 Hand length (손목 붓돌기 점을 잇는 선에서 중지 끝까지).
- **AIST 일본인 손 치수 데이터 (産総研 デジタルヒューマン研究チーム).** 항목 L01 "손 길이: 붓돌기점에서"(ISO 7250-1 4.3.1)와 L02 "손 길이: 손목 주름에서"를 따로 둔다. https://www.airc.aist.go.jp/dhrt/hand/data/list.html
  - 쓴 곳: 우리 손 길이는 L02처럼 손목 주름 기준. 뼈 위치를 손으로 짚는 것보다 실험자 간 오차가 적어서 고름.
- **Ruiz-Ruiz, J., Mesa, J. L. M., Gutiérrez, A., & Castillo, M. J. (2002).** Hand size influences optimal grip span in women but not in men. *Journal of Hand Surgery*, 27(5), 897–901. https://doi.org/10.1053/jhsu.2002.34315
  - 쓴 곳: 손 크기가 편한 쥐기 폭과 관련된다는 근거 (여성에서만 유의). 원문 방법 부분은 열람하지 못함.
- **Ruiz, J. R., España-Romero, V., Ortega, F. B., Sjöström, M., Castillo, M. J., & Gutierrez, A. (2006).** Hand span influences optimal grip span in male and female teenagers. *Journal of Hand Surgery (Am)*, 31(8), 1367–1372. https://doi.org/10.1016/j.jhsa.2006.06.014
  - 쓴 곳: **span 측정 정의의 출처.** 손을 최대한 벌린 상태에서 엄지 끝부터 소지 끝까지 잰다 (초록에 명시). 같은 그룹의 2002 연구를 잇는 후속 연구로, span이 최적 쥐기 폭과 남녀 모두에서 관련됨(13–18세 206명).

## 주관 평가

- **Hart, S. G., & Staveland, L. E. (1988).** Development of NASA-TLX (Task Load Index): Results of empirical and theoretical research. *Advances in Psychology*, 52, 139–183. https://doi.org/10.1016/S0166-4115(08)62386-9 — 기법별 작업 부하(Raw TLX).
- **Sauro, J., & Dumas, J. S. (2009).** Comparison of three one-question, post-task usability questionnaires. *Proc. CHI 2009*, 1599–1608. https://doi.org/10.1145/1518701.1518946 — SEQ, 조건별 난이도 7점.
- **Douglas, S. A., Kirkpatrick, A. E., & MacKenzie, I. S. (1999).** Testing pointing device performance and user assessment with the ISO 9241, Part 9 standard. *Proc. CHI '99*, 215–222. https://doi.org/10.1145/302979.303042 — ISO 9241-9 장치 평가 설문 13문항, 5점 형식(원문 그림 3에서 문항 확인, https://www.yorku.ca/mack/CHI99b.html).
- **ISO 9241-9:2000.** Ergonomic requirements for office work with visual display terminals — Part 9: Requirements for non-keyboard input devices (2012년 ISO 9241-411로 대체). — 장치 평가 설문 출처. 인용 판은 원문 확인 후 확정.

## 통계 분석 (`gripspread_analysis.html`)

- **Leys, C., Ley, C., Klein, O., Bernard, P., & Licata, L. (2013).** Detecting outliers: Do not use standard deviation around the mean, use absolute deviation around the median. *Journal of Experimental Social Psychology*, 49(4), 764–766. https://doi.org/10.1016/j.jesp.2013.03.013 — MAD 기준 강건 z, 임계 3.
- **Sen, P. K. (1968).** Estimates of the regression coefficient based on Kendall's tau. *JASA*, 63(324), 1379–1389. https://doi.org/10.1080/01621459.1968.10480934 — Theil–Sen 기울기.
- **Greenhouse, S. W., & Geisser, S. (1959).** On methods in the analysis of profile data. *Psychometrika*, 24, 95–112. https://doi.org/10.1007/BF02289823 — 구형성 보정.
- **Olejnik, S., & Algina, J. (2003).** Generalized eta and omega squared statistics. *Psychological Methods*, 8(4), 434–447. https://doi.org/10.1037/1082-989X.8.4.434 · **Bakeman, R. (2005).** Recommended effect size statistics for repeated measures designs. *Behavior Research Methods*, 37(3), 379–384. https://doi.org/10.3758/BF03192707 — η²G.
- **Wobbrock, J. O., Findlater, L., Gergle, D., & Higgins, J. J. (2011).** The aligned rank transform for nonparametric factorial analyses using only ANOVA procedures. *Proc. CHI 2011*, 143–146. https://doi.org/10.1145/1978942.1978963 — ART 확인 검정.
- **Holm, S. (1979).** A simple sequentially rejective multiple test procedure. *Scandinavian Journal of Statistics*, 6(2), 65–70. — 사후 비교 보정.
- **Cousineau, D. (2005).** Confidence intervals in within-subject designs. *Tutorials in Quantitative Methods for Psychology*, 1(1), 42–45. https://doi.org/10.20982/tqmp.01.1.p042 · **Morey, R. D. (2008).** Confidence intervals from normalized data: A correction to Cousineau (2005). *TQMP*, 4(2), 61–64. https://doi.org/10.20982/tqmp.04.2.p061 — 피험자 내 신뢰구간.
- **Mahony, R., Hamel, T., & Pflimlin, J.-M. (2008).** Nonlinear complementary filters on the special orthogonal group. *IEEE Transactions on Automatic Control*, 53(5), 1203–1218. https://doi.org/10.1109/TAC.2008.923738 — 자이로·가속도 상보 필터.

## IMU

- **Pedley, M. (2013).** Tilt sensing using a three-axis accelerometer. NXP (Freescale) Application Note AN3461. https://www.nxp.com/docs/en/application-note/AN3461.pdf
  - 쓴 곳: 가속도로 기울기를 구하는 원리 (포터블 모니터, 실험 프로그램의 기울기 추정).

## 수업 자료

- 이재연, CSE333 HCI개론, *Research Methods: Quantitative Evaluation 1* (11주차). 종속변수 정의, 측정 척도, 파일럿 테스트, 안내문, 참가자 수.
