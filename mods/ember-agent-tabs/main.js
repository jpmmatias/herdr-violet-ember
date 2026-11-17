import { View, div } from "gpui-kit";
import { layout, run, theme } from "herdr";

export default class EmberAgentTabs extends View {
  render() {
    const findStack = node => node?.id === "agents" ? node : node?.children?.map(findStack).find(Boolean);
    const active = findStack(layout())?.active || "Tasks";
    const t = theme();
    return div().size_full().flex().items_center().gap(4).px(4).bg(t.chrome)
      .children(["Tasks", "Agents"].map(child => div().id(`ember-tab-${child}`).flex_1().min_w(0).py(5).rounded(5)
        .bg(active === child ? t.selected : t.chrome).text_color(t.foreground).text_size(11).text_center().truncate()
        .tooltip(child === "Tasks" ? "Ember task list" : "Herdr agents, pins and sub-agents")
        .cursor_pointer().child(child).on_click(() => run("layout.select", {stack:"agents", child}))));
  }
}
