import { Workbook } from 'exceljs';
import { buildReportExcel, safeExcelText } from './excel';

describe('Excel report', () => {
  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1:A2)'])(
    'neutralizes formula text %s',
    (value) => {
      expect(safeExcelText(value)).toBe(`'${value}`);
    },
  );

  it('creates the Korean report sheet and exact columns', async () => {
    const buffer = await buildReportExcel([
      {
        workDate: '2026-07-13',
        name: '김직원',
        email: 'worker@aimskr.com',
        startTime: '18:00',
        endTime: '20:00',
        durationMinutes: 120,
        reason: '배포 대응',
      },
    ]);
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('업무연장 내역');

    expect(sheet?.getRow(1).values).toEqual([
      undefined,
      '근무일',
      '직원 이름',
      '이메일',
      '시작 시간',
      '종료 시간',
      '추가 근무',
      '업무 내용',
    ]);
    expect(sheet?.getCell('F2').value).toBe('2시간');
  });
});
