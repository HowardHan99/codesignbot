# Adding New Miro Boards

## Prerequisites
- A Miro account with access to the board you want to add
- The Board ID of your Miro board (found in the board's URL: `https://miro.com/app/board/YOUR_BOARD_ID=`)
- OAuth token for the board (if not using the default board)

## Method 1: Using Environment Variables (Recommended for Development)

1. Open your `.env` file in the project root
2. Add or update the following variables:
```env
NEXT_PUBLIC_MIRO_OAUTH_TOKEN="your_oauth_token"
NEXT_PUBLIC_MIRO_BOARD_ID="your_board_id"
```
3. Restart your development server
4. The application will automatically connect to the specified board

## Method 2: Using the UI (For Additional Boards)

1. If no board is connected, you'll see the "Add Another Board" section
2. Find your Board ID from the Miro board URL
   - Open your Miro board
   - Copy the ID from the URL (e.g., `uXjVNzqQxNs=` from `https://miro.com/app/board/uXjVNzqQxNs=/`)
3. Enter the Board ID in the input field
4. Click "Add Board"
5. Click the "Login to Board" button that appears
6. Authorize the application in the Miro popup
7. The board will be added to your application

## Board Requirements

Your Miro board should have the following frames:
- `Design-Proposal`: For design decision sticky notes
- `Analysis-Response`: For analysis responses
- `Sketch-Reference`: For design sketches and images

## Troubleshooting

If you encounter issues:
1. Ensure your OAuth token is valid and has the correct permissions
2. Check that the Board ID is correct and the board exists
3. Clear your browser cache and local storage
4. Restart the development server
5. Ensure you have the necessary permissions on the Miro board

## Security Notes

- Keep your OAuth tokens secure and never commit them directly to the repository
- Use environment variables for sensitive information
- Regularly rotate OAuth tokens for security
- Consider using different tokens for development and production environments 