import { test, expect } from '@playwright/test'

// 基础生成流程：页面加载 -> 点击生成 -> 渲染结果卡片

test('generate flow renders result card', async ({ page }) => {
  await page.goto('/')

  // 打印页面 HTML 以便诊断定位问题
  const initialHTML = await page.content()
  console.log('Initial HTML length:', initialHTML.length)

  // 等待首页标题渲染，确保页面加载完成
  await expect(page.getByText('调酒小精灵')).toBeVisible()

  // 直接点击生成按钮（默认已选中“开心”）
  const genBtn = page.getByRole('button', { name: '开始调制！' })
  await expect(genBtn).toBeVisible()
  await expect(genBtn).toBeEnabled()
  await genBtn.click()

  // 断言结果卡片包含风味雷达与方法信息
  await expect(page.getByText('风味雷达')).toBeVisible()
  await expect(page.getByText('方法 / 酒杯 / 冰块')).toBeVisible()
})