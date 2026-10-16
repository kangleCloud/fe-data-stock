import { onMounted, reactive, ref } from "vue";
import type { PageResponse } from "@/types/api";
import type { PortfolioQuery } from "@/types/portfolio";
import { errorText } from "@/utils/portfolio";
/** 页面本地查询状态；不轮询，迟到响应不能覆盖新查询。 */
export function usePortfolioPage<T>(
  fetcher: (query: PortfolioQuery) => Promise<PageResponse<T>>,
) {
  const rows = ref<T[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref("");
  const query = reactive<PortfolioQuery>({ pageNum: 1, pageSize: 10 });
  const appliedQuery = ref<PortfolioQuery>({});
  let epoch = 0;
  async function load(reset = false) {
    if (reset) {
      query.pageNum = 1;
    }
    const own = ++epoch;
    const requestedQuery = { ...query };
    loading.value = true;
    error.value = "";
    try {
      const result = await fetcher(requestedQuery);
      if (own === epoch) {
        rows.value = result.list as typeof rows.value;
        total.value = result.total;
        // 数据及其查询口径同批确认；失败或迟到响应不能改变旧画面的截止日。
        appliedQuery.value = requestedQuery;
      }
    } catch (caughtError) {
      if (own === epoch) {
        error.value = errorText(caughtError);
      }
    } finally {
      if (own === epoch) {
        loading.value = false;
      }
    }
  }
  onMounted(() => load());
  return { rows, total, loading, error, query, appliedQuery, load };
}
