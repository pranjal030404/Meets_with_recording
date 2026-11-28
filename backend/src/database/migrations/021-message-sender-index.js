/** 021 - "who has written in this conversation" (used to decide whose email address a person may see). */
const NAME = 'messages_conv_sender';

export async function up(queryInterface) {
  const existing = await queryInterface.showIndex('Messages');
  if (!existing.some((i) => i.name === NAME)) await queryInterface.addIndex('Messages', ['conversationId', 'senderId'], { name: NAME });
}

export async function down(queryInterface) {
  await queryInterface.removeIndex('Messages', NAME);
}
