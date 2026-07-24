export function pageAfterSingleRowDelete(
  pageNum: number,
  currentRowCount: number,
): number {
  return currentRowCount === 1 && pageNum > 1 ? pageNum - 1 : pageNum;
}
