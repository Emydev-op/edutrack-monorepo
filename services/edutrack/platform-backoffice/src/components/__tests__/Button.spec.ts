import { Button } from '@edutrack/ui/components/button';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

describe('Button', () => {
  it('does not submit the surrounding form unless it is the submit button', async () => {
    let submits = 0;
    const Form = defineComponent(
      () => () =>
        h('form', { onSubmit: (e: Event) => (e.preventDefault(), submits++) }, [
          h(Button, { id: 'add' }, () => 'Add branch'),
          h(Button, { id: 'save', type: 'submit' }, () => 'Continue'),
        ]),
    );
    const wrapper = mount(Form, { attachTo: document.body });

    expect(wrapper.find('#add').attributes('type')).toBe('button');
    await wrapper.find('#add').trigger('click');
    expect(submits).toBe(0);

    await wrapper.find('#save').trigger('click');
    expect(submits).toBe(1);
    wrapper.unmount();
  });
});
