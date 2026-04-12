import type { CardData, CardField, CardAction } from '../skill/interfaces/type-skill';

export class MessageRenderer {
  renderCard(card: CardData, topicType?: string): string {
    const parts: string[] = [];

    const prefix = topicType ? `[${topicType}] ` : '';
    parts.push(`## ${prefix}${card.title}`);
    parts.push('');
    parts.push(`**Status**: ${card.status}`);

    if (card.fields.length > 0) {
      parts.push('');
      parts.push('---');
      for (const field of card.fields) {
        parts.push(`- **${field.label}**: ${this.renderFieldValue(field)}`);
      }
    }

    if (card.actions && card.actions.length > 0) {
      parts.push('');
      for (const action of card.actions) {
        parts.push(this.renderAction(action));
      }
    }

    return parts.join('\n');
  }

  renderCommandResult(action: string, success: boolean, details?: string): string {
    const status = success ? 'OK' : 'Error';
    const parts = [`**${action}**: ${status}`];
    if (details) {
      parts.push(details);
    }
    return parts.join('\n');
  }

  private renderFieldValue(field: CardField): string {
    switch (field.type) {
      case 'link':
        return `[${field.value}](${field.value})`;
      case 'user':
        return `@${field.value}`;
      default:
        return field.value;
    }
  }

  private renderAction(action: CardAction): string {
    if (action.command.startsWith('http')) {
      return `[${action.label}](${action.command})`;
    }
    return `${action.label}: \`${action.command}\``;
  }
}
